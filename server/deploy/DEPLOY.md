# clowder-sync deployment checklist

One-time setup on the VPS (already done for the live deploy; recorded here so a
teammate can stand it up from scratch or rebuild it).

1. **Database + role** (PostgreSQL 16 cluster, data dir on the volume):
   ```bash
   sudo -u postgres psql -c "CREATE ROLE clowder_sync_app LOGIN PASSWORD '<pw>';"
   sudo -u postgres createdb -O clowder_sync_app clowder_sync
   ```

2. **venv on the volume** (root disk is ~98% full — never build it on root):
   ```bash
   python3 -m venv /mnt/volume_nyc3_01/jacob/clowder-sync-venv
   /mnt/volume_nyc3_01/jacob/clowder-sync-venv/bin/pip install -r ../requirements.txt
   ```

3. **Env file**: `cp deploy/.env.example ../.env`, fill in the DB password and
   the shared Resend key, then `chmod 600 ../.env`.

4. **systemd unit**:
   ```bash
   sudo cp deploy/clowder-sync.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now clowder-sync
   curl -s http://127.0.0.1:3486/api/health
   ```

5. **Apache** (`/api/` proxy on BOTH vhosts — see deploy/apache-api-proxy.conf):
   ```bash
   sudo a2enmod proxy proxy_http
   # add the proxy block to both -le-ssl.conf files (before FallbackResource)
   sudo apachectl configtest && sudo systemctl reload apache2
   curl -s https://clowderandcrest.com/api/health
   curl -s https://clowder.stephens.page/api/health
   ```

6. **Frontend**: `npm run build` (output `dist/` is the live Apache docroot).

## After code changes

- Server: `sudo systemctl restart clowder-sync`
- Client: `npm run build`

## Verify list (things that bite)

- Real Capacitor `Origin` header on Android/iOS builds matches `CLOWDER_CORS_ORIGINS`.
- `noreply@stephens.page` sender (clowderandcrest.com is not Resend-verified).
- `__Host-` cookie is per-domain: signing in at clowderandcrest.com is a
  separate web session from clowder.stephens.page (expected).
