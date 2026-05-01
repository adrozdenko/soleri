# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Soleri, please report it responsibly.

**Do not open a public issue.** Instead, email security concerns to **andrii@drozd.co** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact

## Response Timeline

- **Acknowledgment:** within 48 hours
- **Assessment:** within 1 week
- **Fix or mitigation:** depends on severity, but we aim for 2 weeks for critical issues

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Older releases | No -- please upgrade |

## Scope

Security issues include:

- Code execution vulnerabilities in the engine or CLI
- Secret leakage (API keys, tokens exposed through logs or exports)
- SQL injection in vault queries
- Path traversal in file operations
- Dependency vulnerabilities (report via GitHub Dependabot or email)

Issues that are **not** security vulnerabilities:

- Feature requests
- Documentation gaps
- Performance issues

## Accepted Risks

### Astro XSS in `define:vars` (GHSA-j687-52p2-xcff)

- **Affects:** `astro < 6.1.6`
- **Severity:** Moderate
- **Context:** This repo's Astro usage is a static Starlight documentation site.
- **Why not exploitable here:** The XSS requires user-controlled input to be passed into `define:vars` at build or render time. This site has no such input path — all content is static and author-controlled.
- **Decision:** Risk accepted. Upgrade deferred to the planned Astro 5 → 6 framework migration.
- **Reviewed:** 2026-05-01
