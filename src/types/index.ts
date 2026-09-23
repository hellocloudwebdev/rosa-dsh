export type NavItemId =
  | "new-email"
  | "templates"
  | "my-brands"
  | "brand-images"
  | "campaigns"
  | "audience"
  | "sending-domains"
  | "sending-activity"
  | "history";

export interface GeneratedEmail {
  subject: string;
  previewText: string;
  headline: string;
  body: string[];
  ctaText: string;
  ctaLink: string;
}

export interface SuggestionPrompt {
  id: string;
  iconType: "plus" | "scan" | "globe";
  verb: string;
  rest: string;
  fullPrompt: string;
}
