use std::io;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub const HEADER: usize = 28;
pub const MAX_FRAME: usize = 256 * 1024;

#[derive(Clone, Copy, Debug)]
pub struct Header {
    pub kind: u8,
    pub id: u32,
    pub fd: i32,
    pub a: i32,
    pub b: i32,
    pub c: i32,
}

pub fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

impl Header {
    pub fn parse(packet: &[u8]) -> io::Result<(Self, &[u8])> {
        if !(HEADER..=MAX_FRAME).contains(&packet.len()) {
            return Err(invalid("invalid relay packet size"));
        }
        let word = |offset| u32::from_le_bytes(packet[offset..offset + 4].try_into().unwrap());
        if word(24) as usize != packet.len() - HEADER {
            return Err(invalid("relay payload length mismatch"));
        }
        Ok((
            Self {
                kind: packet[0],
                id: word(4),
                fd: word(8) as i32,
                a: word(12) as i32,
                b: word(16) as i32,
                c: word(20) as i32,
            },
            &packet[HEADER..],
        ))
    }

    pub fn encode(self, payload: &[u8]) -> Vec<u8> {
        let mut packet = vec![0; HEADER];
        packet[0] = self.kind;
        for (offset, word) in [
            (4, self.id),
            (8, self.fd as u32),
            (12, self.a as u32),
            (16, self.b as u32),
            (20, self.c as u32),
            (24, payload.len() as u32),
        ] {
            packet[offset..offset + 4].copy_from_slice(&word.to_le_bytes());
        }
        packet.extend_from_slice(payload);
        packet
    }

    pub fn reply(self, result: i32, errno: i32, extra: i32, payload: &[u8]) -> Vec<u8> {
        Self {
            kind: 128,
            a: result,
            b: errno,
            c: extra,
            ..self
        }
        .encode(payload)
    }
}

pub async fn read_packet(reader: &mut (impl AsyncRead + Unpin)) -> io::Result<Vec<u8>> {
    let size = reader.read_u32_le().await? as usize;
    if !(HEADER..=MAX_FRAME).contains(&size) {
        return Err(invalid("invalid relay frame size"));
    }
    let mut packet = vec![0; size];
    reader.read_exact(&mut packet).await?;
    Header::parse(&packet)?;
    Ok(packet)
}

pub async fn write_packet(writer: &mut (impl AsyncWrite + Unpin), packet: &[u8]) -> io::Result<()> {
    writer.write_u32_le(packet.len() as u32).await?;
    writer.write_all(packet).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_c_wire_layout_and_signed_fields() {
        let h = Header {
            kind: 4,
            id: 0x12345678,
            fd: 9,
            a: -1,
            b: 9295,
            c: 0x6401a8c0,
        };
        let packet = h.encode(b"abc");
        assert_eq!(&packet[..8], &[4, 0, 0, 0, 0x78, 0x56, 0x34, 0x12]);
        assert_eq!(&packet[20..24], &[192, 168, 1, 100]);
        let (decoded, payload) = Header::parse(&packet).unwrap();
        assert_eq!(decoded.a, -1);
        assert_eq!(decoded.b, 9295);
        assert_eq!(payload, b"abc");
    }

    #[test]
    fn rejects_truncated_and_inconsistent_packets() {
        for size in 0..HEADER {
            assert!(Header::parse(&vec![0; size]).is_err());
        }
        let mut packet = vec![0; HEADER];
        packet[24] = 1;
        assert!(Header::parse(&packet).is_err());
    }

    #[tokio::test]
    async fn rejects_oversize_before_allocating_payload() {
        let prefix = ((MAX_FRAME + 1) as u32).to_le_bytes();
        assert!(read_packet(&mut &prefix[..]).await.is_err());
    }
}
