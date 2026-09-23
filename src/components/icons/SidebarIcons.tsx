import React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number;
}

// 4 squares template layout with a small plus sign
export const TemplatesIcon: React.FC<IconProps> = ({ className = "w-4 h-4", size = 18, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M17.5 14.5v6" />
    <path d="M14.5 17.5h6" />
  </svg>
);

// My Brands: circle badge with smiley face and brand tag arrow
export const MyBrandsIcon: React.FC<IconProps> = ({ className = "w-4 h-4", size = 18, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M8 9.5h.01" />
    <path d="M16 9.5h.01" />
    <path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" />
    <path d="M19 5l2-2m0 0h-3m3 0v3" strokeWidth="1.5" />
  </svg>
);

// Brand Images: dashed picture frame with sparkle
export const BrandImagesIcon: React.FC<IconProps> = ({ className = "w-4 h-4", size = 18, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
    <path d="M16 6v3m-1.5-1.5h3" strokeWidth="1.5" />
  </svg>
);

// Campaigns: magic wand with sparkles
export const CampaignsIcon: React.FC<IconProps> = ({ className = "w-4 h-4", size = 18, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M15 4l5 5L8 21l-5-5L15 4z" />
    <path d="M18 2v3m-1.5-1.5h3" strokeWidth="1.5" />
    <path d="M4 11v2m-1-1h2" strokeWidth="1.5" />
    <path d="M11 20v2m-1-1h2" strokeWidth="1.5" />
  </svg>
);

// Audience: avatar inside dotted ring
export const AudienceIcon: React.FC<IconProps> = ({ className = "w-4 h-4", size = 18, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <circle cx="12" cy="12" r="9" strokeDasharray="2 3" />
    <circle cx="12" cy="10" r="3" />
    <path d="M7 18c0-2.5 2.2-4 5-4s5 1.5 5 4" />
  </svg>
);

// Sending Domains: globe with grid
export const SendingDomainsIcon: React.FC<IconProps> = ({ className = "w-4 h-4", size = 18, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a15 15 0 0 1 0 18" />
    <path d="M12 3a15 15 0 0 0 0 18" />
    <path d="M3.5 9h17" />
    <path d="M3.5 15h17" />
  </svg>
);

// Sending Activity: compass navigation arrow
export const SendingActivityIcon: React.FC<IconProps> = ({ className = "w-4 h-4", size = 18, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <path d="M3 11l18-8-8 18-3-7-7-3z" />
  </svg>
);
