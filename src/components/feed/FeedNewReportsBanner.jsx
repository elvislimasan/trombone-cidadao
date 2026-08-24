import React from 'react';
import { RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const FeedNewReportsBanner = ({ count, onRefresh }) => (
  <AnimatePresence>
    {count > 0 && (
      <motion.div
        key="new-banner"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="sticky top-[52px] z-10 flex justify-center pt-2 px-3"
      >
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-full shadow-lg"
        >
          <RefreshCw size={13} />
          {count === 1
            ? '1 nova bronca — atualizar'
            : `${count} novas broncas — atualizar`}
        </button>
      </motion.div>
    )}
  </AnimatePresence>
);

export default FeedNewReportsBanner;
