import React from 'react';
import '../styles/tokens.css';

interface ProgressBarProps {
  current: number;
  total: number;
  showText?: boolean;
  height?: number;
  color?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  total,
  showText = true,
  height = 8,
  color = 'var(--primary-teal)'
}) => {
  const percentage = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;

  return (
    <div style={styles.wrapper}>
      <div style={{ ...styles.track, height }}>
        <div
          style={{
            ...styles.fill,
            width: `${percentage}%`,
            height,
            backgroundColor: color
          }}
        />
      </div>
      {showText && <span style={styles.text}>{percentage}%</span>}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%'
  },
  track: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '4px',
    overflow: 'hidden'
  },
  fill: {
    borderRadius: '4px',
    transition: 'width 0.4s ease-out'
  },
  text: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--primary-teal)',
    minWidth: '38px',
    textAlign: 'right'
  }
};
