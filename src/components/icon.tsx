import { HugeiconsIcon } from "@hugeicons/react";
import type { Search01Icon } from "@hugeicons/core-free-icons";

export type IconType = typeof Search01Icon;

export function Icon({
  icon,
  size = 20,
  className,
}: {
  icon: IconType;
  size?: number;
  className?: string;
}) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={1.7}
      aria-hidden="true"
      className={className}
    />
  );
}
