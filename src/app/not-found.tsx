import { ContentShell } from "@/components/content-shell";
export default function NotFound() {
  return (
    <ContentShell>
      <span className="eyebrow">404 · A SMALL DETOUR</span>
      <h1>
        This page
        <br />
        <em>isn't on the shelf.</em>
      </h1>
      <p className="content-intro">Find your store or head back to today's grocery promotions.</p>
      <a className="content-cta" href="/">
        Back to offers
      </a>
    </ContentShell>
  );
}
