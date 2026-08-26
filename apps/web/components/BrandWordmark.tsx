import Image from "next/image";

type BrandWordmarkSize = "sm" | "md" | "lg";

const sizeClasses: Record<BrandWordmarkSize, string> = {
  sm: "brand-wordmark-sm",
  md: "brand-wordmark-md",
  lg: "brand-wordmark-lg",
};

export function BrandWordmark({
  size = "md",
  className = "",
}: {
  size?: BrandWordmarkSize;
  className?: string;
}) {
  return (
    <span
      className={`brand-wordmark leading-none ${sizeClasses[size]} ${className}`}
    >
      <span className="sr-only">Odovi</span>
      <span aria-hidden="true" className="brand-wordmark-art">
        <Image
          alt=""
          className="brand-wordmark-image brand-wordmark-image-light"
          height={273}
          src="/brand/odovi-logo-horizontal-light-1600.png"
          width={1600}
        />
        <Image
          alt=""
          className="brand-wordmark-image brand-wordmark-image-dark"
          height={273}
          src="/brand/odovi-logo-horizontal-dark-1600.png"
          width={1600}
        />
      </span>
    </span>
  );
}
