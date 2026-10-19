import { motion } from "framer-motion";
import { Plus, ScanText, Globe, ArrowUpRight, Scale } from "lucide-react";
import type { SuggestionPrompt } from "../types";

interface SuggestedListProps {
  onSelectPrompt: (prompt: string) => void;
}

const SUGGESTIONS: SuggestionPrompt[] = [
  {
    id: "generate-welcome",
    iconType: "plus",
    verb: "Generate",
    rest: " a welcome email for new subscribers joining our newsletter with a special onboarding offer",
    fullPrompt:
      "Generate a high-converting welcome email for new subscribers joining our newsletter with a warm introduction, brand story, and a 15% discount code.",
  },
  {
    id: "summarize-launch",
    iconType: "scan",
    verb: "Summarize",
    rest: " a product launch email for our newest AI release highlighting top user features and early access",
    fullPrompt:
      "Summarize a product launch email for our newest AI release, emphasizing the top 3 productivity benefits, a customer quote, and a clear CTA to start free trial.",
  },
  {
    id: "automate-reengagement",
    iconType: "globe",
    verb: "Automate",
    rest: " a re-engagement email for customers who haven't made a purchase in 45 days with tailored recommendations",
    fullPrompt:
      "Draft an automated re-engagement email for inactive customers who haven't shopped in 45 days, featuring a friendly 'We miss you' tone and personalized recommendations.",
  },
];

export function SuggestedList({ onSelectPrompt }: SuggestedListProps) {
  const getIcon = (type: SuggestionPrompt["iconType"]) => {
    switch (type) {
      case "plus":
        return <Plus className="w-4 h-4 stroke-[2]" />;
      case "scan":
        return <ScanText className="w-4 h-4 stroke-[1.8]" />;
      case "globe":
        return <Globe className="w-4 h-4 stroke-[1.8]" />;
      default:
        return <Scale className="w-4 h-4 stroke-[1.8]" />;
    }
  };

  return (
    <div className="w-full mt-8">
      <h3 className="text-[15px] font-semibold text-[var(--text-primary)] tracking-tight mb-2 px-1 text-left">
        Suggested for today
      </h3>

      <div className="space-y-0.5">
        {SUGGESTIONS.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.05 }}
            whileHover={{ x: 2 }}
            onClick={() => onSelectPrompt(item.fullPrompt)}
            className="group flex items-center justify-between py-2 px-2.5 -mx-2 rounded-xl hover:bg-[var(--hover-overlay)] transition-colors cursor-pointer select-none text-left"
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors shrink-0">
                {getIcon(item.iconType)}
              </span>
              <p className="text-sm leading-relaxed truncate">
                <span className="font-semibold text-[var(--text-primary)] mr-1.5">{item.verb}</span>
                <span className="font-normal text-[var(--text-secondary)]">{item.rest}</span>
              </p>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
