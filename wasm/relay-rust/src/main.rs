mod bridge;
mod policy;
mod protocol;

use std::{env, io, net::Ipv4Addr, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::{mpsc, Semaphore},
    time::timeout,
};

async fn serve(mut stream: TcpStream, token: Arc<Vec<u8>>, wan: bool) -> io::Result<()> {
    stream.set_nodelay(true)?;
    let mut supplied = vec![0; token.len()];
    timeout(Duration::from_secs(3), stream.read_exact(&mut supplied)).await??;
    // The process-local token never passes through the browser or the public HTTP API.
    let different = supplied
        .iter()
        .zip(token.iter())
        .fold(0u8, |diff, (a, b)| diff | (a ^ b));
    if different != 0 {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    stream.write_all(b"OK").await?;
    let (mut reader, mut writer) = stream.into_split();
    let (output, mut packets) = mpsc::channel::<Vec<u8>>(32);
    let mut bridge = bridge::Bridge::new(output, wan);
    let receive = async {
        loop {
            let packet = protocol::read_packet(&mut reader).await?;
            bridge.handle(&packet).await?;
        }
        #[allow(unreachable_code)]
        Ok::<(), io::Error>(())
    };
    let send = async {
        while let Some(packet) = packets.recv().await {
            timeout(
                Duration::from_secs(5),
                protocol::write_packet(&mut writer, &packet),
            )
            .await??;
        }
        Ok::<(), io::Error>(())
    };
    // Dropping either future also drops every console socket and aborts its reader.
    tokio::select! { result = receive => result, result = send => result }
}

#[tokio::main]
async fn main() -> io::Result<()> {
    let token = env::var("CHIAKI_RELAY_TOKEN").unwrap_or_default();
    if token.len() != 64 || !token.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(protocol::invalid(
            "CHIAKI_RELAY_TOKEN must be 64 hex characters; launch through the Node server",
        ));
    }
    let wan = env::var("CHIAKI_RELAY_ALLOW_WAN")
        .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(true);
    let token = Arc::new(token.into_bytes());
    // The parent keeps stdin open as a liveness pipe. EOF also handles a parent
    // crash or forced termination where Node cannot run its exit handlers.
    std::thread::spawn(|| {
        use std::io::Read;
        let _ = std::io::stdin().read(&mut [0u8; 1]);
        std::process::exit(0);
    });
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
    println!("CHIAKI_RELAY_READY {}", listener.local_addr()?.port());
    let slots = Arc::new(Semaphore::new(32));
    loop {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => break,
            connection = listener.accept() => {
                let (stream, _) = connection?;
                let Ok(permit) = slots.clone().try_acquire_owned() else { continue; };
                let token = token.clone();
                tokio::spawn(async move {
                    let _permit = permit;
                    if let Err(error) = serve(stream, token, wan).await {
                        if !matches!(error.kind(), io::ErrorKind::UnexpectedEof | io::ErrorKind::ConnectionReset) {
                            eprintln!("relay session ended: {error}");
                        }
                    }
                });
            }
        }
    }
    Ok(())
}
