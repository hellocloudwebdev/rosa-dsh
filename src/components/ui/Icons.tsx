import type { SVGProps } from "react";

/**
 * Inline SVG icon set.
 *
 * Hand-rolled rather than a font/CDN icon library: the spec forbids external
 * font and asset requests, and this keeps the bundle deterministic offline.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5 8.4 10.1 4 8.5l4.4-1.6L10 2.5z" />
      <path d="M15.5 13.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 4.5v11M4.5 10h11" />
    </Icon>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 5.5A2 2 0 015.5 3.5h9a2 2 0 012 2v6a2 2 0 01-2 2H8l-4 3.5v-3.5a2 2 0 01-.5-1.5v-6z" />
    </Icon>
  );
}

export function CompareIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="4" width="6.5" height="12" rx="1.5" />
      <rect x="11" y="4" width="6.5" height="12" rx="1.5" />
    </Icon>
  );
}

export function LibraryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 4.5h13v11h-13z" />
      <path d="M3.5 8h13M7.5 8v7.5" />
    </Icon>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="7" r="3.5" />
      <path d="M9.5 9.5L16 16M14 14l1.6-1.6M12 12l1.6-1.6" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13 13l4 4" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
    </Icon>
  );
}

export function SidebarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="2.5" y="4" width="15" height="12" rx="2" />
      <path d="M8 4v12" />
    </Icon>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 3l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 13.8 5.8 16l.8-4.7L3.2 8l4.7-.7L10 3z" />
    </Icon>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.5 3.5l4 4-1.5 1.5-1-1-4.5 4.5.5 2-2 2-1-1 2-2 2 .5 4.5-4.5-1 1L12.5 3.5z" />
    </Icon>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
      <path d="M13 4.5H5.5A2 2 0 003.5 6.5V14" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10.5l4 4 8-9" />
    </Icon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15.5 6.5A6.5 6.5 0 104 10" />
      <path d="M15.5 3v3.5H12" />
    </Icon>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="6" y="6" width="8" height="8" rx="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 10l13-5.5-5.5 13-2-5-5.5-2.5z" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 6h11M8 6V4.5h4V6M6.5 6l.5 9.5h6L13.5 6M9 9v4M11 9v4" />
    </Icon>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 3.5l3 3L8 15H5v-3l8.5-8.5z" />
    </Icon>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 5.5A1.5 1.5 0 015 4h3l1.5 2H15a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0115 15H5a1.5 1.5 0 01-1.5-1.5v-8z" />
    </Icon>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.5 5l5 5-5 5" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </Icon>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 3.5l7 12.5H3l7-12.5z" />
      <path d="M10 8v3.5M10 13.5v.5" />
    </Icon>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4h4v4M16 4l-6 6" />
      <path d="M14 11.5V15a1.5 1.5 0 01-1.5 1.5H5A1.5 1.5 0 013.5 15V7.5A1.5 1.5 0 015 6h3.5" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
      <path d="M7 9V6.5a3 3 0 016 0V9" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="7" r="3" />
      <path d="M4.5 16.5c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5" />
    </Icon>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4" />
    </Icon>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16 12.5A7 7 0 017.5 4a7 7 0 108.5 8.5z" />
    </Icon>
  );
}

export function MetricsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 16.5h13" />
      <path d="M6 13V8M10 13V4.5M14 13v-3" />
    </Icon>
  );
}

export function GithubIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.5 16.5v-2.2c-2.2.3-2.7-1-2.7-1.4 0-.7.3-1.2.7-1.6-1.9-.3-3.2-1.3-3.2-3.6 0-1 .4-1.9 1-2.6-.2-.6-.2-1.5.1-2.3 0 0 1 .2 2.3 1.1a6 6 0 013.2 0C10 2.4 11 2.2 11 2.2c.3.8.3 1.7.1 2.3.6.7 1 1.6 1 2.6 0 2.3-1.3 3.3-3.2 3.6.4.4.7.9.7 1.6v2.2" />
    </Icon>
  );
}

export function GoogleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.5v7M6.5 8.5h7M6.5 11.5h7" />
    </Icon>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="4.5" width="13" height="11" rx="1.5" />
      <circle cx="7.5" cy="8" r="1.2" />
      <path d="M4 14l3.5-3.5 2.5 2.5 3-3L16 13" />
    </Icon>
  );
}

export function ToolIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12.5 4.5a3 3 0 013.4 4.9l-6.6 6.6-3.4.8.8-3.4 6.6-6.6a3 3 0 01-.8-2.3z" />
    </Icon>
  );
}

export function DotIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="3" fill="currentColor" stroke="none" />
    </Icon>
  );
}
