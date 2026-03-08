import { motion } from "framer-motion";

type GreetingProps = {
  clientName?: string | null;
  sessionDate?: string | null;
};

function getGreeting({ clientName, sessionDate }: GreetingProps): {
  headline: string;
  subline: string;
} {
  if (clientName && sessionDate) {
    const formatted = new Date(sessionDate).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return {
      headline: `Let's reflect on your session with ${clientName}`,
      subline: `from ${formatted}. What would you like to explore?`,
    };
  }

  if (clientName) {
    return {
      headline: `Ready to reflect on your work with ${clientName}.`,
      subline: "What would you like to explore?",
    };
  }

  return {
    headline: "Welcome back.",
    subline: "What would you like to reflect on today?",
  };
}

export const Greeting = ({ clientName, sessionDate }: GreetingProps) => {
  const { headline, subline } = getGreeting({ clientName, sessionDate });

  return (
    <div
      className="mx-auto mt-4 flex size-full max-w-3xl flex-col justify-center px-4 md:mt-16 md:px-8"
      key="overview"
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="font-semibold text-xl md:text-2xl"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
      >
        {headline}
      </motion.div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="text-xl text-zinc-500 md:text-2xl"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.6 }}
      >
        {subline}
      </motion.div>
    </div>
  );
};
