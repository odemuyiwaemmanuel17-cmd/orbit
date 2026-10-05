import { Component } from 'react'
import { TriangleAlert } from 'lucide-react'

/** Catches render/crash errors (e.g. WebGL unavailable) with an escape hatch. */
export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="fixed inset-0 z-50 bg-[#020a06] grid place-items-center p-6">
        <div className="glass rounded-xl p-6 max-w-md text-center">
          <TriangleAlert size={26} className="mx-auto text-amber-400 mb-3" />
          <h2 className="font-bold text-emerald-50">Signal anomaly</h2>
          <p className="text-[13px] text-emerald-100/60 mt-2 font-mono break-words">
            {String(this.state.error?.message ?? this.state.error)}
          </p>
          <div className="flex justify-center gap-2 mt-5">
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 text-emerald-950 hover:bg-emerald-400">
              Retry
            </button>
            <a href="/"
               className="px-4 py-2 rounded-lg text-sm border border-emerald-400/30 text-emerald-100 hover:border-emerald-400/60">
              Return to site
            </a>
          </div>
        </div>
      </div>
    )
  }
}
