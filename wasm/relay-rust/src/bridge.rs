use crate::{
    policy,
    protocol::{self, Header},
};
use std::{
    collections::HashMap,
    io,
    net::{Ipv4Addr, SocketAddr, SocketAddrV4},
    sync::Arc,
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{tcp::OwnedWriteHalf, TcpStream, UdpSocket},
    sync::mpsc,
    task::JoinHandle,
    time::timeout,
};

const IO_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_SOCKETS: usize = 64;
type Output = mpsc::Sender<Vec<u8>>;

struct Socket {
    kind: i32,
    udp: Option<Arc<UdpSocket>>,
    tcp: Option<OwnedWriteHalf>,
    reader: Option<JoinHandle<()>>,
    remote: Option<SocketAddrV4>,
}

impl Socket {
    fn new(kind: i32) -> Self {
        Self {
            kind,
            udp: None,
            tcp: None,
            reader: None,
            remote: None,
        }
    }
}

impl Drop for Socket {
    fn drop(&mut self) {
        if let Some(reader) = &self.reader {
            reader.abort();
        }
    }
}

pub struct Bridge {
    sockets: HashMap<i32, Socket>,
    output: Output,
    wan: bool,
}

fn event(kind: u8, fd: i32, port: u16, ip: Ipv4Addr, data: &[u8]) -> Vec<u8> {
    Header {
        kind,
        id: 0,
        fd,
        a: 0,
        b: port as i32,
        c: i32::from_le_bytes(ip.octets()),
    }
    .encode(data)
}

fn errno(error: &io::Error) -> i32 {
    match error.kind() {
        io::ErrorKind::PermissionDenied => 13,
        io::ErrorKind::AddrInUse => 98,
        io::ErrorKind::ConnectionRefused => 111,
        io::ErrorKind::TimedOut => 110,
        io::ErrorKind::NotConnected | io::ErrorKind::BrokenPipe => 107,
        _ => 5,
    }
}

impl Bridge {
    pub fn new(output: Output, wan: bool) -> Self {
        Self {
            sockets: HashMap::new(),
            output,
            wan,
        }
    }

    async fn emit(&self, packet: Vec<u8>) -> io::Result<()> {
        self.output
            .send(packet)
            .await
            .map_err(|_| io::ErrorKind::BrokenPipe.into())
    }

    async fn reply(
        &self,
        h: Header,
        result: i32,
        error: i32,
        extra: i32,
        data: &[u8],
    ) -> io::Result<()> {
        if h.id != 0 {
            self.emit(h.reply(result, error, extra, data)).await?;
        }
        Ok(())
    }

    fn destination(&self, port: i32, address: i32) -> Result<SocketAddrV4, i32> {
        let port = u16::try_from(port).ok().filter(|p| *p != 0).ok_or(22)?;
        let ip = Ipv4Addr::from(address.to_le_bytes());
        if !policy::allowed(ip, Some(port), self.wan) {
            return Err(13);
        }
        Ok(SocketAddrV4::new(ip, port))
    }

    async fn ensure_udp(&mut self, fd: i32) -> io::Result<()> {
        let rec = self
            .sockets
            .get_mut(&fd)
            .ok_or_else(|| protocol::invalid("unknown socket"))?;
        if rec.kind != 2 {
            return Err(protocol::invalid("not a UDP socket"));
        }
        if rec.udp.is_some() {
            return Ok(());
        }
        // Match the existing web proxy: bind to an ephemeral local port, regardless of
        // the console's requested port, so simultaneous browser clients do not collide.
        let udp = Arc::new(UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).await?);
        udp.set_broadcast(true)?;
        let receiver = udp.clone();
        let output = self.output.clone();
        rec.reader = Some(tokio::spawn(async move {
            let mut buffer = vec![0; 65536];
            loop {
                match receiver.recv_from(&mut buffer).await {
                    Ok((n, SocketAddr::V4(peer))) => {
                        if output
                            .send(event(129, fd, peer.port(), *peer.ip(), &buffer[..n]))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    Ok(_) => {}
                    Err(_) => {
                        let _ = output
                            .send(event(132, fd, 0, Ipv4Addr::UNSPECIFIED, &[]))
                            .await;
                        break;
                    }
                }
            }
        }));
        rec.udp = Some(udp);
        Ok(())
    }

    pub async fn handle(&mut self, packet: &[u8]) -> io::Result<()> {
        let (h, payload) = Header::parse(packet)?;
        match h.kind {
            1 => {
                let error = if h.a != 2 {
                    97
                } else if h.b != 1 && h.b != 2 {
                    93
                } else if h.fd < 0 {
                    9
                } else if self.sockets.contains_key(&h.fd) {
                    22
                } else if self.sockets.len() >= MAX_SOCKETS {
                    24
                } else {
                    0
                };
                if error == 0 {
                    self.sockets.insert(h.fd, Socket::new(h.b));
                }
                self.reply(h, if error == 0 { 0 } else { -1 }, error, 0, &[])
                    .await
            }
            2 => {
                self.sockets.remove(&h.fd);
                self.reply(h, 0, 0, 0, &[]).await
            }
            3 => {
                if !self.sockets.contains_key(&h.fd) {
                    return self.reply(h, -1, 9, 0, &[]).await;
                }
                let error = self
                    .ensure_udp(h.fd)
                    .await
                    .err()
                    .as_ref()
                    .map(errno)
                    .unwrap_or(0);
                self.reply(h, if error == 0 { 0 } else { -1 }, error, 0, &[])
                    .await
            }
            4 => self.connect(h).await,
            5 | 6 => self.send(h, payload).await,
            7 => {
                let error = if let Some(rec) = self.sockets.get(&h.fd) {
                    if h.b == 6 {
                        rec.udp
                            .as_ref()
                            .and_then(|udp| udp.set_broadcast(h.c != 0).err())
                            .as_ref()
                            .map(errno)
                            .unwrap_or(0)
                    } else {
                        0
                    }
                } else {
                    9
                };
                self.reply(h, if error == 0 { 0 } else { -1 }, error, 0, &[])
                    .await
            }
            8 => {
                let Some(rec) = self.sockets.get(&h.fd) else {
                    return self.reply(h, -1, 9, 0, &[]).await;
                };
                let addr = rec
                    .udp
                    .as_ref()
                    .and_then(|s| s.local_addr().ok())
                    .or_else(|| rec.tcp.as_ref().and_then(|s| s.local_addr().ok()));
                let (port, ip) = match addr {
                    Some(SocketAddr::V4(a)) => (a.port(), i32::from_le_bytes(a.ip().octets())),
                    _ => (0, 0),
                };
                self.reply(h, port as i32, 0, ip, &[]).await
            }
            9 => {
                let host = std::str::from_utf8(payload)
                    .map_err(|_| protocol::invalid("invalid hostname"))?
                    .trim_end_matches('\0');
                if host.is_empty() || host.len() > 253 || host.contains('\0') {
                    return self.reply(h, -1, 0, 0, &[]).await;
                }
                let result = timeout(IO_TIMEOUT, tokio::net::lookup_host((host, 0))).await;
                if let Ok(Ok(mut addresses)) = result {
                    if let Some(ip) = addresses.find_map(|a| match a {
                        SocketAddr::V4(v4) if policy::allowed(*v4.ip(), None, self.wan) => {
                            Some(*v4.ip())
                        }
                        _ => None,
                    }) {
                        let ip = i32::from_le_bytes(ip.octets());
                        return self.reply(h, ip, 0, 0, &ip.to_le_bytes()).await;
                    }
                }
                self.reply(h, -1, 0, 0, &[]).await
            }
            10 => {
                let error = if let Some(rec) = self.sockets.get_mut(&h.fd) {
                    if let Some(tcp) = &mut rec.tcp {
                        match timeout(IO_TIMEOUT, tcp.shutdown()).await {
                            Ok(Ok(())) => 0,
                            Ok(Err(e)) => errno(&e),
                            Err(_) => 110,
                        }
                    } else {
                        0
                    }
                } else {
                    9
                };
                self.reply(h, if error == 0 { 0 } else { -1 }, error, 0, &[])
                    .await
            }
            _ => self.reply(h, -1, 22, 0, &[]).await,
        }
    }

    async fn connect(&mut self, h: Header) -> io::Result<()> {
        let peer = match self.destination(h.b, h.c) {
            Ok(peer) => peer,
            Err(e) => return self.reply(h, -1, e, 0, &[]).await,
        };
        let Some(rec) = self.sockets.get_mut(&h.fd) else {
            return self.reply(h, -1, 9, 0, &[]).await;
        };
        if rec.kind == 2 {
            rec.remote = Some(peer);
            return self.reply(h, 0, 0, 0, &[]).await;
        }
        if rec.tcp.is_some() {
            return self.reply(h, -1, 106, 0, &[]).await;
        }
        match timeout(IO_TIMEOUT, TcpStream::connect(peer)).await {
            Ok(Ok(tcp)) => {
                tcp.set_nodelay(true)?;
                let (mut reader, writer) = tcp.into_split();
                let output = self.output.clone();
                rec.tcp = Some(writer);
                rec.remote = Some(peer);
                // Queue the connected event and RPC reply before the first incoming data.
                self.emit(event(130, h.fd, 0, Ipv4Addr::UNSPECIFIED, &[]))
                    .await?;
                self.reply(h, 0, 0, 0, &[]).await?;
                let task = tokio::spawn(async move {
                    let mut buffer = vec![0; 65536];
                    loop {
                        match reader.read(&mut buffer).await {
                            Ok(0) => break,
                            Ok(n) => {
                                if output
                                    .send(event(129, h.fd, peer.port(), *peer.ip(), &buffer[..n]))
                                    .await
                                    .is_err()
                                {
                                    return;
                                }
                            }
                            Err(_) => {
                                let _ = output
                                    .send(event(132, h.fd, 0, Ipv4Addr::UNSPECIFIED, &[]))
                                    .await;
                                break;
                            }
                        }
                    }
                    let _ = output
                        .send(event(131, h.fd, 0, Ipv4Addr::UNSPECIFIED, &[]))
                        .await;
                });
                self.sockets.get_mut(&h.fd).unwrap().reader = Some(task);
                Ok(())
            }
            result => {
                let error = match result {
                    Ok(Err(e)) => errno(&e),
                    _ => 110,
                };
                self.reply(h, -1, error, 0, &[]).await?;
                self.emit(event(132, h.fd, 0, Ipv4Addr::UNSPECIFIED, &[]))
                    .await
            }
        }
    }

    async fn send(&mut self, h: Header, payload: &[u8]) -> io::Result<()> {
        let Some(rec) = self.sockets.get(&h.fd) else {
            return self.reply(h, -1, 9, 0, &[]).await;
        };
        let result = if rec.kind == 2 {
            let peer = if h.b != 0 || h.c != 0 {
                match self.destination(h.b, h.c) {
                    Ok(p) => p,
                    Err(e) => return self.reply(h, -1, e, 0, &[]).await,
                }
            } else if let Some(p) = rec.remote {
                p
            } else {
                return self.reply(h, -1, 107, 0, &[]).await;
            };
            if let Err(e) = self.ensure_udp(h.fd).await {
                return self.reply(h, -1, errno(&e), 0, &[]).await;
            }
            let send = self.sockets[&h.fd]
                .udp
                .as_ref()
                .unwrap()
                .send_to(payload, peer);
            match timeout(IO_TIMEOUT, send).await {
                Ok(result) => result.map(|_| ()),
                Err(_) => Err(io::ErrorKind::TimedOut.into()),
            }
        } else if let Some(tcp) = &mut self.sockets.get_mut(&h.fd).unwrap().tcp {
            match timeout(IO_TIMEOUT, tcp.write_all(payload)).await {
                Ok(result) => result,
                Err(_) => Err(io::ErrorKind::TimedOut.into()),
            }
        } else {
            Err(io::ErrorKind::NotConnected.into())
        };
        match result {
            Ok(()) => self.reply(h, payload.len() as i32, 0, 0, &[]).await,
            Err(e) => {
                self.reply(h, -1, errno(&e), 0, &[]).await?;
                self.emit(event(132, h.fd, 0, Ipv4Addr::UNSPECIFIED, &[]))
                    .await
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(kind: u8, fd: i32, a: i32, b: i32, c: i32, data: &[u8]) -> Vec<u8> {
        Header {
            kind,
            id: 1,
            fd,
            a,
            b,
            c,
        }
        .encode(data)
    }

    #[tokio::test]
    async fn enforces_socket_limit_and_rejects_duplicate_fds() {
        let (tx, mut rx) = mpsc::channel(128);
        let mut bridge = Bridge::new(tx, false);
        for fd in 0..64 {
            bridge.handle(&request(1, fd, 2, 2, 0, &[])).await.unwrap();
            assert_eq!(Header::parse(&rx.recv().await.unwrap()).unwrap().0.a, 0);
        }
        bridge.handle(&request(1, 64, 2, 2, 0, &[])).await.unwrap();
        assert_eq!(Header::parse(&rx.recv().await.unwrap()).unwrap().0.b, 24);
        bridge.handle(&request(1, 0, 2, 2, 0, &[])).await.unwrap();
        assert_eq!(Header::parse(&rx.recv().await.unwrap()).unwrap().0.b, 22);
    }

    #[tokio::test]
    async fn denied_destination_returns_error_instead_of_success() {
        let (tx, mut rx) = mpsc::channel(8);
        let mut bridge = Bridge::new(tx, false);
        bridge.handle(&request(1, 1, 2, 2, 0, &[])).await.unwrap();
        rx.recv().await.unwrap();
        bridge
            .handle(&request(
                6,
                1,
                2,
                9295,
                i32::from_le_bytes([127, 0, 0, 1]),
                b"denied",
            ))
            .await
            .unwrap();
        let packet = rx.recv().await.unwrap();
        let (h, _) = Header::parse(&packet).unwrap();
        assert_eq!((h.a, h.b), (-1, 13));
    }

    #[tokio::test]
    async fn udp_bind_getsockname_receive_and_drop_release_port() {
        let (tx, mut rx) = mpsc::channel(8);
        let mut bridge = Bridge::new(tx, false);
        for packet in [request(1, 1, 2, 2, 0, &[]), request(3, 1, 2, 9296, 0, &[])] {
            bridge.handle(&packet).await.unwrap();
            rx.recv().await.unwrap();
        }
        bridge.handle(&request(8, 1, 0, 0, 0, &[])).await.unwrap();
        let port = Header::parse(&rx.recv().await.unwrap()).unwrap().0.a as u16;
        assert_ne!(port, 0);
        let sender = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        sender
            .send_to(b"video", (Ipv4Addr::LOCALHOST, port))
            .await
            .unwrap();
        let packet = timeout(Duration::from_secs(2), rx.recv())
            .await
            .unwrap()
            .unwrap();
        let (h, data) = Header::parse(&packet).unwrap();
        assert_eq!(h.kind, 129);
        assert_eq!(data, b"video");
        drop(bridge);
        // Aborting a reader is asynchronous, including on the multithreaded runtime.
        timeout(Duration::from_secs(1), async {
            loop {
                if UdpSocket::bind((Ipv4Addr::LOCALHOST, port)).await.is_ok() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
        })
        .await
        .unwrap();
    }
}
