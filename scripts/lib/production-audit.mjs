const BLOCKING_SEVERITIES = new Set(["critical", "high"]);
const DISPOSITIONS = new Set(["not_applicable", "temporarily_accepted"]);

function exceptionKey(advisoryId, packageName) {
  return `${advisoryId}:${packageName}`;
}

function requireText(value, field, index, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`Exception ${index + 1} must define a non-empty ${field}.`);
  }
}

export function blockingFindings(report) {
  if (!report || typeof report !== "object" || !report.advisories || typeof report.advisories !== "object") {
    throw new Error("Audit output does not contain an advisories object.");
  }

  return Object.values(report.advisories)
    .filter((advisory) => BLOCKING_SEVERITIES.has(advisory.severity))
    .map((advisory) => ({
      advisoryId: advisory.github_advisory_id ?? String(advisory.id),
      package: advisory.module_name,
      severity: advisory.severity,
      title: advisory.title,
      url: advisory.url,
      affectedVersions: advisory.vulnerable_versions,
      patchedVersions: advisory.patched_versions,
    }));
}

export function validateExceptions(exceptions, today = new Date().toISOString().slice(0, 10)) {
  if (!Array.isArray(exceptions)) {
    return ["The exception registry must be a JSON array."];
  }

  const errors = [];
  const keys = new Set();

  exceptions.forEach((exception, index) => {
    if (!exception || typeof exception !== "object" || Array.isArray(exception)) {
      errors.push(`Exception ${index + 1} must be an object.`);
      return;
    }

    requireText(exception.advisoryId, "advisoryId", index, errors);
    requireText(exception.package, "package", index, errors);
    requireText(exception.rationale, "rationale", index, errors);
    requireText(exception.owner, "owner", index, errors);

    if (!DISPOSITIONS.has(exception.disposition)) {
      errors.push(
        `Exception ${index + 1} disposition must be not_applicable or temporarily_accepted.`,
      );
    }

    if (typeof exception.expiresOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(exception.expiresOn)) {
      errors.push(`Exception ${index + 1} expiresOn must use YYYY-MM-DD.`);
    } else if (
      Number.isNaN(Date.parse(`${exception.expiresOn}T00:00:00Z`)) ||
      new Date(`${exception.expiresOn}T00:00:00Z`).toISOString().slice(0, 10) !== exception.expiresOn
    ) {
      errors.push(`Exception ${index + 1} expiresOn is not a valid date.`);
    } else if (exception.expiresOn < today) {
      errors.push(`Exception ${index + 1} expired on ${exception.expiresOn}.`);
    }

    if (typeof exception.advisoryId === "string" && typeof exception.package === "string") {
      const key = exceptionKey(exception.advisoryId, exception.package);
      if (keys.has(key)) {
        errors.push(`Duplicate exception for ${key}.`);
      }
      keys.add(key);
    }
  });

  return errors;
}

export function evaluateAudit(report, exceptions, today) {
  const findings = blockingFindings(report);
  const errors = validateExceptions(exceptions, today);
  const exceptionByKey = new Map(
    Array.isArray(exceptions)
      ? exceptions.map((exception) => [exceptionKey(exception.advisoryId, exception.package), exception])
      : [],
  );
  const findingKeys = new Set(
    findings.map((finding) => exceptionKey(finding.advisoryId, finding.package)),
  );

  const accepted = [];
  const unaccepted = [];
  for (const finding of findings) {
    const exception = exceptionByKey.get(exceptionKey(finding.advisoryId, finding.package));
    if (exception) {
      accepted.push({ finding, exception });
    } else {
      unaccepted.push(finding);
    }
  }

  for (const [key] of exceptionByKey) {
    if (!findingKeys.has(key)) {
      errors.push(`Stale exception does not match a current finding: ${key}.`);
    }
  }

  return { accepted, errors, findings, unaccepted };
}
