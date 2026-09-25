export default function LoadingScreen({ ready, error }) {
  return (
    <div
      className={`loading-screen${ready || error ? ' loaded' : ''}`}
      aria-live="polite"
      aria-label={error || 'กำลังเปิดสมุด'}
    >
      {!error && <span className="loading-book" aria-hidden="true"><i /><i /></span>}
      <span>{error || 'กำลังเปิดสมุด…'}</span>
    </div>
  );
}
