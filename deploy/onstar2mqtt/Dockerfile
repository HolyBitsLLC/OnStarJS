# Derived onstar2mqtt image carrying the HolyBitsLLC-patched `onstarjs2`.
#
# Why this exists: upstream `onstar2mqtt` resolves `onstarjs2` from npm, and the
# published 2.16.x still waits 60 s for `input[name="otpCode"]`, which no longer
# exists on GM's current "Verify it's you" page. This fork publishes a patched
# build as a GitHub release asset (see ADR-0156 in HolyBitsLLC/harvester-argo);
# this image installs that exact artifact over the upstream tree.
#
# It is built PRIVATE-side ("publish route B") because HolyBitsLLC/OnStarJS is a
# public fork and a public caller cannot reference a reusable workflow in the
# private harvester-argo repo. See
# harvester-argo/.github/workflows/publish-onstar2mqtt.yaml, which calls
# reusable-kaniko-build.yaml with:
#     source_repository: HolyBitsLLC/OnStarJS
#     dockerfile:        deploy/onstar2mqtt/Dockerfile
#
# Maintenance: bump the base image tag, ONSTARJS2_PATCH_URL and
# ONSTARJS2_PATCH_VERSION together, and rebuild. Nothing else in this file
# depends on the onstar2mqtt version.

FROM ghcr.io/bigthundersr/onstar2mqtt:2.8.4

# Immutable release asset of HolyBitsLLC/OnStarJS, not an npm registry version:
# the patch is ours and npm would resolve the unpatched 2.16.7.
ARG ONSTARJS2_PATCH_URL=https://github.com/HolyBitsLLC/OnStarJS/releases/download/v2.16.7-holybits.1/onstarjs2-2.16.7-holybits.1.tgz
ARG ONSTARJS2_PATCH_VERSION=2.16.7-holybits.1
# The patched onstarjs2 pins patchright exactly; upstream onstar2mqtt:2.8.4
# overrides it to ^1.58.2, which would resolve to an incompatible browser
# automation client. Keep these two in lockstep with the library's package.json.
ARG PATCHRIGHT_VERSION=1.60.2

USER root

# 1. Declare the patched tarball as the onstarjs2 dependency and align the
#    patchright override.
# 2. Re-resolve ONLY what changed: `npm install --package-lock-only` rewrites
#    the lockfile for the new dependency/override while keeping upstream's pins
#    for everything else, then `npm ci` installs that exact tree.
# 3. Reinstall the Chromium build that patchright 1.60.2 expects — the base
#    image's browser was provisioned by patchright 1.58.2 and its revision may
#    not match.
# 4. Fail the build if the image does not actually carry the patch.
RUN set -eux; \
    cd /app; \
    ONSTARJS2_PATCH_URL="$ONSTARJS2_PATCH_URL" \
    PATCHRIGHT_VERSION="$PATCHRIGHT_VERSION" \
    node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.dependencies.onstarjs2=process.env.ONSTARJS2_PATCH_URL;p.overrides=Object.assign({},p.overrides,{patchright:process.env.PATCHRIGHT_VERSION});fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"; \
    npm install --package-lock-only --no-audit --no-fund --legacy-peer-deps; \
    npm ci --omit=dev --no-audit --no-fund --legacy-peer-deps; \
    npx patchright install chromium --with-deps; \
    npm cache clean --force; \
    rm -rf /root/.npm /tmp/* /var/tmp/* /var/lib/apt/lists/*; \
    ONSTARJS2_PATCH_VERSION="$ONSTARJS2_PATCH_VERSION" \
    node -e "const fs=require('fs');const p=require('/app/node_modules/onstarjs2/package.json');if(p.version!==process.env.ONSTARJS2_PATCH_VERSION){console.error('onstarjs2 version mismatch: '+p.version);process.exit(1);}const s=fs.readFileSync(require.resolve('onstarjs2'),'utf8');if(!s.includes('MFA_CODE_FIELD_SELECTORS')){console.error('patched MFA selector list missing from onstarjs2 dist');process.exit(1);}console.log('onstarjs2 '+p.version+' with MFA patch present');"
