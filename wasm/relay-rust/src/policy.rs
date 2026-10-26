use std::net::Ipv4Addr;

// Preserve the upstream LAN and discovery behavior. WAN stays limited to Remote Play ports.
pub fn allowed(ip: Ipv4Addr, port: Option<u16>, wan: bool) -> bool {
    if ip.is_private() || ip.is_broadcast() || ip.is_multicast() {
        return true;
    }
    let [a, b, _, _] = ip.octets();
    if a == 0 || a == 127 || a >= 240 || (a == 169 && b == 254) {
        return false;
    }
    wan && port.is_none_or(|p| [987, 9295, 9296, 9297, 9302].contains(&p))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lan_discovery_wan_and_special_addresses() {
        let check = |ip: &str, port, wan| allowed(ip.parse().unwrap(), port, wan);
        assert!(check("192.168.1.100", Some(9295), false));
        assert!(check("255.255.255.255", Some(9302), false));
        assert!(check("239.0.0.1", Some(987), false));
        assert!(check("8.8.8.8", Some(9295), true));
        assert!(!check("8.8.8.8", Some(443), true));
        assert!(!check("8.8.8.8", Some(9295), false));
        for ip in ["127.0.0.1", "0.0.0.0", "169.254.169.254", "250.0.0.1"] {
            assert!(!check(ip, Some(9295), true));
        }
    }
}
