import { Wallet01Icon, GiftIcon, SparklesIcon } from "@hugeicons/core-free-icons";

export const designs = [
  {
    id: "wallet",
    name: "Wallet",
    description: "Your stores, neatly stacked",
    scene: "Soft ribbons",
    icon: Wallet01Icon,
  },
  {
    id: "rewards",
    name: "Rewards",
    description: "A brighter way to save",
    scene: "Floating tiles",
    icon: GiftIcon,
  },
  {
    id: "orbit",
    name: "Orbit",
    description: "A fresh perspective on offers",
    scene: "Slow orbits",
    icon: SparklesIcon,
  },
] as const;
