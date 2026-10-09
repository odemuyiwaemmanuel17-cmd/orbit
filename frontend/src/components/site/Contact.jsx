import { useState } from 'react'
import { Mail, MessageSquare, MapPin, Rocket, Send, CheckCircle2 } from 'lucide-react'

const TOPICS = [
  'General question',
  'Feedback on the visualization',
  'API access & data licensing',
  'Workshops & education',
  'Other',
]

const inputCls = 'w-full bg-black/25 border border-hi/20 rounded-lg px-3 py-2.5 text-sm text-fg placeholder:text-mut focus:outline-none focus:border-hi/60'

export default function Contact() {
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', topic: '', org: '', msg: '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = (e) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.topic || !form.msg) return
    setSent(true)
  }

  return (
    <section id="contact" className="relative py-24 px-5">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12">
        <div>
          <div className="text-[11px] font-mono tracking-[0.3em] text-hi mb-3">CONTACT</div>
          <h2 className="text-3xl md:text-4xl font-black text-fg tracking-tight">
            Talk to mission control
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-fg/65">
            Questions about the tracker, feedback on the visualization, or interest in API
            access and data licensing? Send us a signal and we&apos;ll respond within one
            business day.
          </p>
          <ul className="mt-8 space-y-5">
            <li className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-hi/10 border border-hi/25 grid place-items-center">
                <Mail size={15} className="text-hi" />
              </span>
              <div>
                <div className="text-[10px] font-mono tracking-widest text-mut">EMAIL</div>
                <a className="text-sm text-fg hover:text-hi"
                   href="mailto:odemuyiwaemmanuel17@gmail.com">odemuyiwaemmanuel17@gmail.com</a>
              </div>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-hi/10 border border-hi/25 grid place-items-center">
                <MessageSquare size={15} className="text-hi" />
              </span>
              <div>
                <div className="text-[10px] font-mono tracking-widest text-mut">COMMUNITY</div>
                <div className="text-sm text-fg">Discussion forum &amp; issue tracker on GitHub</div>
              </div>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-lg bg-hi/10 border border-hi/25 grid place-items-center">
                <MapPin size={15} className="text-hi" />
              </span>
              <div>
                <div className="text-[10px] font-mono tracking-widest text-mut">LAB</div>
                <div className="text-sm text-fg">Lagos, Nigeria · Remote-first team</div>
              </div>
            </li>
          </ul>
          <div className="mt-8 glass rounded-xl p-4 flex gap-3">
            <Rocket size={16} className="text-hi shrink-0 mt-0.5" />
            <p className="text-[12px] leading-relaxed text-fg/65">
              Educators and researchers: ask about free workshops on orbital mechanics using
              OrbitalPulse as a teaching tool.
            </p>
          </div>
        </div>

        <div className="glass rounded-2xl p-6">
          <h3 className="font-bold text-fg">Send us a message</h3>
          <p className="text-[11px] text-fg/50 mt-1 mb-5">
            Fields marked with an asterisk (*) are required.
          </p>
          {sent ? (
            <div className="py-16 text-center">
              <CheckCircle2 size={36} className="mx-auto text-hi mb-3" />
              <div className="font-bold text-fg">Message transmitted</div>
              <p className="text-[13px] text-fg/60 mt-2">
                Thanks, {form.name.split(' ')[0]} — we&apos;ll respond within one business day.
              </p>
              <button onClick={() => setSent(false)}
                      className="mt-5 text-[12px] font-mono text-hi hover:text-hi">
                ← compose another
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-fg font-semibold">Full name *</label>
                  <input required value={form.name} onChange={set('name')} placeholder="Ada Lovelace"
                         className={`mt-1.5 ${inputCls}`} />
                </div>
                <div>
                  <label className="text-[11px] text-fg font-semibold">Email address *</label>
                  <input required type="email" value={form.email} onChange={set('email')}
                         placeholder="you@example.com" className={`mt-1.5 ${inputCls}`} />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-fg font-semibold">Topic *</label>
                  <select required value={form.topic} onChange={set('topic')} className={`mt-1.5 ${inputCls}`}>
                    <option value="">Select a topic…</option>
                    {TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-fg font-semibold">Organization (optional)</label>
                  <input value={form.org} onChange={set('org')} placeholder="University, company, agency…"
                         className={`mt-1.5 ${inputCls}`} />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-fg font-semibold">Message *</label>
                <textarea required rows={5} value={form.msg} onChange={set('msg')}
                          placeholder="Tell us what you're working on or what you'd like to see in OrbitalPulse…"
                          className={`mt-1.5 ${inputCls} resize-y`} />
              </div>
              <button type="submit"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm bg-pri text-bg hover:bg-hi shadow-[0_0_20px_rgba(16,185,129,0.35)] transition">
                <Send size={14} /> Transmit Message
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
