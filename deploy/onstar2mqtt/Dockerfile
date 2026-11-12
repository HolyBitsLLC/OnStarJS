# Derived onstar2mqtt image carrying the HolyBitsLLC-patched `onstarjs2`.
#
# Why this exists: upstream `onstar2mqtt` resolves `onstarjs2` from npm, and the
# published 2.16.x still waits 60 s for `input[name="otpCode"]`, which no longer
# exists on GM's current "Verify it's you" page. This fork publishes a patched
# build as a GitHub release asset (see ADR-0156 / ADR-0157 in
# HolyBitsLLC/harvester-argo); this image installs that exact artifact over the
# upstream tree.
#
# It is built PRIVATE-side ("publish route B") because HolyBitsLLC/OnStarJS is a
# public fork and a public caller cannot reference a reusable workflow in the
# private harvester-argo repo. See
# harvester-argo/.github/workflows/publish-onstar2mqtt.yaml, which calls
# reusable-kaniko-build.yaml with:
#     source_repository: HolyBitsLLC/OnStarJS
#     dockerfile:        deploy/onstar2mqtt/Dockerfile
#
# Maintenance: bump the base image tag AND its digest, ONSTARJS2_PATCH_URL,
# ONSTARJS2_PATCH_VERSION and ONSTARJS2_PATCH_SHA256 together, then rebuild.
# Nothing else in this file depends on the onstar2mqtt version.

# Base pinned by digest as well as tag: the tag is mutable, the digest is what
# was tested.
FROM ghcr.io/bigthundersr/onstar2mqtt:2.11.0@sha256:d37121037380ba4b9c33f240c656ef0cc83d18b5bb798bc4b80cf32494701747

# Immutable release asset of HolyBitsLLC/OnStarJS, not an npm registry version:
# the patch is ours and npm would resolve the unpatched 2.16.7.
ARG ONSTARJS2_PATCH_URL=https://github.com/HolyBitsLLC/OnStarJS/releases/download/v2.16.7-holybits.1/onstarjs2-2.16.7-holybits.1.tgz
ARG ONSTARJS2_PATCH_VERSION=2.16.7-holybits.1
ARG ONSTARJS2_PATCH_SHA256=c6f1f11b7f677f7c304c34b6af6361deeaa6dfd661f1c3820e2b448b9f4d2c62
# The patched onstarjs2 pins patchright exactly. onstar2mqtt:2.11.0 already
# overrides it to 1.60.2; the older 2.8.4 base overrode it to ^1.58.2, which
# resolved to an incompatible browser automation client. Keep this in lockstep
# with the library's package.json so a future base bump cannot silently drift.
ARG PATCHRIGHT_VERSION=1.60.2

USER root

# 1. Fetch the release asset and verify it against the pinned sha256, so a
#    replaced or truncated asset fails the build instead of shipping silently.
# 2. Declare the verified local tarball as the onstarjs2 dependency and align
#    the patchright override.
# 3. Re-resolve ONLY what changed: `npm install --package-lock-only` rewrites
#    the lockfile for the new dependency/override while keeping upstream's pins
#    for everything else, then `npm ci` installs that exact tree.
# 4. Reinstall the Chromium build that patchright 1.60.2 expects — the base
#    image's browser was provisioned by patchright 1.58.2 and its revision does
#    not match (1208 vs 1223).
# 5. Put the provenance URL back into package.json, drop the now-stale lockfile
#    and the tarball, and fail the build if the image does not actually carry
#    the patch.
RUN set -eux; \
    cd /app; \
    node -e 'const fs=require("fs"),crypto=require("crypto");fetch(process.env.ONSTARJS2_PATCH_URL).then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.arrayBuffer()}).then(b=>{const buf=Buffer.from(b);fs.writeFileSync("/tmp/onstarjs2.tgz",buf);const got=crypto.createHash("sha256").update(buf).digest("hex");console.log("downloaded",buf.length,"bytes sha256",got);if(got!==process.env.ONSTARJS2_PATCH_SHA256){throw new Error("sha256 mismatch: got "+got+" want "+process.env.ONSTARJS2_PATCH_SHA256)}}).catch(e=>{console.error(e.message);process.exit(1)})'; \
    node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.dependencies.onstarjs2="/tmp/onstarjs2.tgz";p.overrides=Object.assign({},p.overrides,{patchright:process.env.PATCHRIGHT_VERSION});fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'; \
    npm install --package-lock-only --no-audit --no-fund --legacy-peer-deps; \
    npm ci --omit=dev --no-audit --no-fund --legacy-peer-deps; \
    npx patchright install chromium --with-deps; \
    node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.dependencies.onstarjs2=process.env.ONSTARJS2_PATCH_URL;fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'; \
    npm cache clean --force; \
    rm -rf /root/.npm /tmp/* /var/tmp/* /var/lib/apt/lists/* /app/package-lock.json; \
    node -e 'const fs=require("fs");const p=require("/app/node_modules/onstarjs2/package.json");if(p.version!==process.env.ONSTARJS2_PATCH_VERSION){console.error("onstarjs2 version mismatch: "+p.version);process.exit(1)}const s=fs.readFileSync(require.resolve("onstarjs2"),"utf8");if(!s.includes("MFA_CODE_FIELD_SELECTORS")){console.error("patched MFA selector list missing from onstarjs2 dist");process.exit(1)}console.log("onstarjs2 "+p.version+" with MFA patch present")'
