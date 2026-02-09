import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * Animated counter component.
 * Counts up from 0 to the target value using an ease-out easing function.
 *
 * @component
 * @param {Object} props - Component props
 * @param {number} props.value - The target number to count up to
 * @returns {JSX.Element} A span element displaying the animated number
 */
const Counter = ({ value }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp = null;
    const duration = 2000;

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Easing function: easeOutQuart
      const ease = 1 - Math.pow(1 - progress, 4);
      setCount(Math.floor(ease * value));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [value]);

  return <span>{count.toLocaleString('pt-BR')}</span>;
};

Counter.propTypes = {
  value: PropTypes.number.isRequired,
};

export default Counter;
