import { useEffect, useState } from 'react';

export default function DesignStudio({ order }) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [color, setColor] = useState('#d9ef78');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState('');
  useEffect(() => { if (!result) { setImage(''); return; } const url = URL.createObjectURL(new Blob([result.svg], { type: 'image/svg+xml' })); setImage(url); return () => URL.revokeObjectURL(url); }, [result]);
  async function generate(event) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null);
    try { const response = await fetch('/api/design', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: order.id, title, subtitle, color }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Design request failed.'); setResult(data); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section className="panel design-studio"><p className="eyebrow">THE DESIGN STUDIO</p><h2>Make something yours.</h2><p>Choose a project name, add a tagline, and set an accent color. Once Tender verifies your Tempo payment, create and download an editable SVG design.</p><form onSubmit={generate}><label>Project or brand name<input maxLength={32} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Your project name"/></label><label>Tagline or announcement<input maxLength={70} value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="What would you like to say?"/></label><label>Accent color<input type="color" value={color} onChange={(event) => setColor(event.target.value)}/></label><button className="primary-button" disabled={busy}>{busy ? 'Verifying & generating…' : 'Create your design ↗'}</button></form>{error && <p className="inline-error" role="alert">{error}</p>}{image && <><img className="design-preview" src={image} alt={`Generated design for ${result ? title : ''}`}/><a className="primary-button" href={image} download={`tender-${order.productId}.svg`}>Download editable SVG ↓</a><p>Generated {new Date(result.generatedAt).toLocaleString()}. Save the file before leaving this page.</p></>}</section>;
}
