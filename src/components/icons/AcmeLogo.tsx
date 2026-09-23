import React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number;
}

export const AcmeLogo: React.FC<IconProps> = ({ className = "w-6 h-6", size, ...props }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* 4 crossing rounded bars at 0°, 45°, 90°, 135° creating the 8-pointed Acme starburst */}
      <rect x="10.6" y="1.5" width="2.8" height="21" rx="1.4" />
      <rect x="1.5" y="10.6" width="21" height="2.8" rx="1.4" />
      <rect x="10.6" y="1.5" width="2.8" height="21" rx="1.4" transform="rotate(45 12 12)" />
      <rect x="10.6" y="1.5" width="2.8" height="21" rx="1.4" transform="rotate(135 12 12)" />
    </svg>
  );
};
