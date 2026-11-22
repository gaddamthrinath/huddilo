# Coturn setup guide for Huddilo

This guide explains the local coturn setup used by Huddilo from the beginning. It is written for someone new to WebRTC, STUN, TURN, Docker, and SFUs.

> Important: coturn is **not** the SFU. mediasoup is our SFU. Coturn is the network fallback that helps a browser reach the SFU when a firewall or NAT blocks the normal route.

## 1. The problem coturn solves

A browser must create a WebRTC connection to our mediasoup SFU in order to send and receive camera, microphone, and screen-share media.

On many home, office, college, and mobile networks, a direct browser-to-SFU path works:

```text
Browser ──────────────────────────> mediasoup SFU
```

Some networks block or cannot route that connection correctly. TURN gives the browser a relay path:

```text
Browser ──> coturn relay ──> mediasoup SFU
```

The browser decides whether it needs coturn during the WebRTC ICE process. The SFU does not make a separate API call to coturn.

Coturn does not know meeting codes, hosts, waiting rooms, or simulcast. It only relays encrypted network traffic.

## 2. STUN and TURN in simple terms

| Term | What it does |
| --- | --- |
| STUN | Lets a browser discover how its network appears to the internet. |
| TURN | Relays media when a direct connection cannot be used. |
| coturn | The open-source server that provides STUN and TURN. |
| ICE | The WebRTC process that tries available connection paths and chooses the best one. |
| SFU | The media server that receives a participant's media and forwards it to other participants. mediasoup fills this role for us. |

TURN costs bandwidth because relayed media travels through the TURN server. That is why browsers try direct browser-to-SFU media first and use TURN only when required.

## 3. What we installed

We installed Docker Engine and the Docker Compose plugin on Fedora. We did **not** install Docker Desktop or any Docker GUI.

We run coturn using its official Docker image instead of installing it directly with Fedora's package manager:

```text
coturn/coturn:latest
```

This keeps coturn isolated from the host operating system and gives us a repeatable setup. The service is defined in [docker-compose.yml](./docker-compose.yml).

## 4. Files in this folder

```text
infra/coturn/
├── docker-compose.yml  # Defines the container and how it starts.
├── turnserver.conf     # Coturn server settings that are safe to commit.
├── .env                # Local realm and private TURN shared secret. Never commit this.
├── .env.example        # Safe template for another developer.
├── .gitignore          # Prevents .env from entering Git.
├── README.md           # Short operational notes.
└── SETUP.md            # This detailed guide.
```

## 5. Why we use Docker host networking locally

The Compose file contains:

```yaml
network_mode: host
```

Normally, Docker gives a container its own private bridge network. Coturn could then advertise its container-only address, such as `172.x.x.x`, as a relay address. A browser running on your Fedora machine may not be able to use that address correctly.

With Linux host networking, coturn uses the Fedora host's actual network interfaces directly:

```text
Browser on Fedora ──> 127.0.0.1:3478
Browser on local Wi-Fi ──> Fedora LAN address:3478
```

This is convenient for local Linux development.

Do **not** copy this production blindly. Production needs a public IP or TURN domain, firewall rules, TLS certificates, and potentially an `external-ip` setting if Docker is behind NAT.

## 6. Docker Compose configuration

The Compose file uses these important settings:

```yaml
image: coturn/coturn:latest
container_name: huddilo-coturn
restart: unless-stopped
network_mode: host
```

| Setting | Why we use it |
| --- | --- |
| `image` | Downloads and runs the coturn server image. |
| `container_name` | Gives Docker a predictable container name for logs and debugging. |
| `restart: unless-stopped` | Restarts coturn after Docker or the computer restarts, unless we manually stop it. |
| `network_mode: host` | Lets coturn use the real Fedora host addresses instead of Docker bridge addresses. |

The configuration file is mounted read-only into the container:

```yaml
volumes:
  - ./turnserver.conf:/etc/turnserver.conf:ro,Z
```

`ro` means the container cannot edit our configuration. `Z` gives the mounted file the correct SELinux label on Fedora.

## 7. TURN shared-secret authentication

The local `.env` file contains two values:

```env
TURN_REALM=localhost
TURN_SHARED_SECRET=<private random value>
```

### `TURN_REALM`

The realm identifies the TURN authentication domain. `localhost` is correct for local development. Production will use a real domain, such as `turn.example.com`.

### `TURN_SHARED_SECRET`

This is a long, random, private secret shared only by:

1. The coturn container.
2. Our backend credential generator.

It must never be committed to Git, returned by public APIs, or placed in frontend JavaScript.

Later, the backend will generate temporary credentials like this conceptually:

```text
username = expiry-timestamp:participant-id
password = HMAC-SHA1(username, TURN_SHARED_SECRET), encoded as Base64
```

The browser receives the temporary username/password. Coturn independently calculates the same value and accepts the connection only until the timestamp expires.

This is better than a permanent TURN username/password because a copied credential expires quickly.

## 8. `turnserver.conf` explained

### Logging

```ini
log-file=stdout
log-min-level=warning
```

- `log-file=stdout` sends logs to Docker, so we can read them with `docker compose logs`.
- `log-min-level=warning` keeps development logs focused on warnings and errors.

### TURN listener and relay ports

```ini
listening-port=3478
min-port=49160
max-port=49200
```

- `3478` is the normal STUN/TURN listening port.
- `49160` to `49200` is the UDP/TCP relay allocation range.
- Keeping the relay range small makes firewall configuration manageable.

For production, the firewall must allow:

```text
3478/UDP
3478/TCP
49160-49200/UDP
49160-49200/TCP
```

### Authentication and abuse protection

```ini
use-auth-secret
fingerprint
no-multicast-peers
```

| Setting | Purpose |
| --- | --- |
| `use-auth-secret` | Enables shared-secret TURN REST authentication. Coturn rejects users without valid temporary credentials. |
| `fingerprint` | Adds a STUN/TURN fingerprint to help message validation. |
| `no-multicast-peers` | Stops clients from using coturn to send traffic to multicast network addresses. |

We intentionally do **not** use `no-auth`. An anonymous TURN server can be abused by strangers as a public network relay.

### Local TLS setting

```ini
no-tls
```

TLS is disabled locally because this machine does not have a public TURN domain or TLS certificate. Local testing uses `turn:` URLs on port `3478`.

Production will enable TLS, add certificates, expose port `5349`, and provide `turns:` URLs as a secure fallback.

## 9. Starting and managing coturn

Run these commands from this directory:

```bash
# From the project root
cd infra/coturn
```

Start or update coturn:

```bash
docker compose up -d
```

Check whether it is running:

```bash
docker compose ps
```

Read live logs:

```bash
docker compose logs -f
```

Restart after configuration changes:

```bash
docker compose up -d --force-recreate
```

Stop without deleting the downloaded image:

```bash
docker compose down
```

## 10. How we verified the local installation

We performed two checks:

1. Confirmed that the `huddilo-coturn` container is running.
2. Ran coturn's local STUN utility against `127.0.0.1`:

```bash
docker compose exec coturn turnutils_stunclient 127.0.0.1
```

The utility returned a reflexive UDP address, proving coturn answered a STUN request on port `3478`.

At this stage we have verified STUN and the coturn process. We have **not** tested a full authenticated TURN relay allocation yet, because the backend still needs a `TurnCredentialService` to create temporary credentials.

## 11. How the browser will use coturn later

After the user is admitted to a meeting, the backend will return ICE server information similar to this:

```ts
{
  urls: [
    "stun:localhost:3478",
    "turn:localhost:3478?transport=udp",
    "turn:localhost:3478?transport=tcp",
  ],
  username: "temporary-expiry-and-participant-id",
  credential: "temporary-hmac-password",
}
```

The browser supplies these values to WebRTC. ICE tries direct paths first and automatically selects the TURN relay only when it is needed.

## 12. Production checklist

Before a public deployment, change all of the following:

- Use a real public hostname such as `turn.yourdomain.com`.
- Change `TURN_REALM` to that hostname.
- Use a newly generated production shared secret stored in a deployment secret manager.
- Pin the coturn Docker image to a tested version or image digest instead of `latest`.
- Open the TURN listener and relay ports in the cloud firewall.
- Configure coturn's public/external IP correctly if it is behind NAT.
- Add TLS certificates and enable `turns:` on port `5349`.
- Add monitoring for allocation count, relay bandwidth, CPU, and container health.
- Keep the backend and coturn clocks synchronized because temporary credentials use expiry timestamps.

## 13. Useful official documentation

- [Coturn README](https://github.com/coturn/coturn/blob/master/README.md)
- [Coturn server configuration reference](https://github.com/coturn/coturn/blob/master/README.turnserver)
- [TURN REST authentication description](https://github.com/coturn/coturn/blob/master/README.turnserver#L2409)
