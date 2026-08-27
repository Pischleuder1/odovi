export function releaseImageEvidence(inspected, { image, version, commit, platform }) {
  const labels = inspected.Config?.Labels ?? {};
  const expectedArchitecture = platform.split("/")[1];

  if (labels["org.opencontainers.image.version"] !== version) {
    throw new Error(`image version label is ${labels["org.opencontainers.image.version"]}, expected ${version}`);
  }
  if (labels["org.opencontainers.image.revision"] !== commit) {
    throw new Error(`image revision label is ${labels["org.opencontainers.image.revision"]}, expected ${commit}`);
  }
  if (inspected.Architecture !== expectedArchitecture) {
    throw new Error(`image architecture is ${inspected.Architecture}, expected ${expectedArchitecture}`);
  }

  return {
    image,
    platform,
    imageId: inspected.Id,
    architecture: inspected.Architecture,
    labels: {
      "org.opencontainers.image.version": labels["org.opencontainers.image.version"],
      "org.opencontainers.image.revision": labels["org.opencontainers.image.revision"],
    },
  };
}
