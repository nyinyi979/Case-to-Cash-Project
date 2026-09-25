import { useEffect, useState } from 'react';
import { symbolsMarkup } from '../bookSymbols.js';
import { pageLoaders } from '../pageManifest.js';
import { initializeBook } from '../legacyBook.js';
import BookControls from './BookControls.jsx';
import BookHeader from './BookHeader.jsx';
import BookStage from './BookStage.jsx';
import LoadingScreen from './LoadingScreen.jsx';
import { useMotionPreference } from '../useMotionPreference.js';

export default function BookExperience() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const motion = useMotionPreference();

  useEffect(() => {
    let cancelled = false;
    let dispose;
    initializeBook({ pageLoaders })
      .then((cleanup) => {
        if (cancelled) cleanup();
        else {
          dispose = cleanup;
          requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
        }
      })
      .catch((cause) => {
        console.error('Could not open the sketchbook:', cause);
        if (!cancelled) setError('เปิดสมุดไม่สำเร็จ ลองโหลดหน้าใหม่อีกครั้ง');
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <>
      <main className="app-shell" aria-busy={!ready}>
        <BookHeader motionMode={motion.mode} onSelectMotion={motion.select} />
        <BookStage symbolsMarkup={symbolsMarkup} />
        <BookControls />
        <div id="pages" aria-hidden="true" />
      </main>
      <LoadingScreen ready={ready} error={error} />
    </>
  );
}
