"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <span className="eyebrow">GROCERY CODES SA</span>
      <h1>A small pause in the savings.</h1>
      <p>We couldn't load the promotion sources. Please try again in a moment.</p>
      <button className="primary-button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
