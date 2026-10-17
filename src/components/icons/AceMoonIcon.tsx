import React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number;
}

export const AceMoonIcon: React.FC<IconProps> = ({ className = "w-4 h-4", size, ...props }) => {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      width={size}
      height={size}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* Lime circle with dark left moon hemisphere — the Ace Studio mark */}
      <circle cx="10" cy="10" r="9" fill="#558766" />
      <path d="M10 1 A9 9 0 0 0 10 19 Z" fill="#11120c" />
      <circle cx="10" cy="10" r="8.7" stroke="rgba(0, 0, 0, 0.08)" strokeWidth="0.6" fill="none" />
    </svg>
  );
};
