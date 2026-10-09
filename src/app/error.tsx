"use client";
import { brandName } from "@/lib/brand";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <span className="eyebrow">{brandName.toUpperCase()}</span>
      <h1>A small pause in the savings.</h1>
      <p>We couldn't load the promotion sources. Please try again in a moment.</p>
      <button className="primary-button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
