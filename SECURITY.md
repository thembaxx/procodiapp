# Security

The supported version is the current main branch of Little Less. Privacy/security findings and remaining deployment controls are recorded in [the audit](docs/security-audit.md).

Report suspected vulnerabilities privately through GitHub's **Report a vulnerability** feature if it is enabled for this repository. A private operator security/privacy email has not yet been configured; the operator must establish this channel before public launch. Do not post credentials, user data or detailed exploit instructions in public issues.

Include the affected route/version, prerequisites, a minimal reproduction and the practical impact. Use your own test data. Avoid paid-provider calls, destructive production writes and traffic/load testing without a separately agreed scope.

For an incident, the operator should restrict affected writes, preserve necessary evidence privately, revoke compromised credentials, assess affected records/providers, patch and verify the deployment, and follow applicable notification duties. Backups, hosting logs and external-provider data require separate assessment. Keep evidence access and retention limited; do not add secrets or personal logs to the public repository.
