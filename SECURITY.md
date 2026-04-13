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
