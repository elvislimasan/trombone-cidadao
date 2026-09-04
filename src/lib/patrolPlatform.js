export const isPatrolBlockedOnDesktop = ({ isNative, isDesktop }) => (
  !isNative && isDesktop
);
