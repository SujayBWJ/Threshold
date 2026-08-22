export type DependencyScanRequest = {
  dependencies: Record<string, string>;
  lockfileVersion?: number;
};

type VulnerabilityRecord = {
  packageName: string;
  affectedVersions: string;
  cve: string;
  severity: "high" | "critical";
  summary: string;
  fixedVersion: string;
  source: string;
};

// This fixture represents data that changes outside the repository and is intentionally
// separate from code analysis. A production provider would refresh it from OSV/NVD.
const vulnerabilityRecords: VulnerabilityRecord[] = [
  {
    packageName: "demo-xml-parser",
    affectedVersions: "1.4.0",
    cve: "THRESHOLD-DEMO-2026-0001",
    severity: "high",
    summary: "Entity expansion can exhaust memory when parsing untrusted XML.",
    fixedVersion: "1.4.1",
    source: "Threshold security feed fixture (OSV-compatible mock record)",
  },
];

export function scanDependencies(input: DependencyScanRequest) {
  const findings = vulnerabilityRecords
    .filter((record) => input.dependencies[record.packageName] === record.affectedVersions)
    .map((record) => ({
      package: record.packageName,
      installedVersion: input.dependencies[record.packageName],
      vulnerability: record.cve,
      severity: record.severity,
      summary: record.summary,
      recommendedVersion: record.fixedVersion,
      source: record.source,
    }));

  return {
    scannedDependencies: Object.keys(input.dependencies).length,
    findings,
    clean: findings.length === 0,
    dataSource: "Threshold security feed fixture (OSV-compatible record)",
    generatedAt: new Date().toISOString(),
  };
}