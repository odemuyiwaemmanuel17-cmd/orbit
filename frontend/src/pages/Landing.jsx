import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import OrbitScene from '../components/scene/OrbitScene.jsx'
import Navbar from '../components/site/Navbar.jsx'
import Hero from '../components/site/Hero.jsx'
import TrackerSection from '../components/site/TrackerSection.jsx'
import HowItWorks from '../components/site/HowItWorks.jsx'
import Services from '../components/site/Services.jsx'
import Gallery from '../components/site/Gallery.jsx'
import About from '../components/site/About.jsx'
import Faq from '../components/site/Faq.jsx'
import Contact from '../components/site/Contact.jsx'
import Footer from '../components/site/Footer.jsx'

/**
 * OrbitalPulse — a 3D scrollytelling site. The WebGL scene is fixed behind
 * the page; scrolling flies the camera through keyframes while the tracker,
 * telemetry HUD, and marketing sections scroll over it.
 */
export default function Landing() {
  // Returning from /tracker via an anchor link (e.g. /#tracker): scroll once
  // the landing tree has mounted. Purely functional; visuals are unchanged.
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) {
      requestAnimationFrame(() => {
        document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' })
      })
    }
  }, [hash])

  return (
    <>
      <OrbitScene />
      <div className="relative z-10">
        <Navbar />
        <main>
          <Hero />
          <TrackerSection />
          <HowItWorks />
          <Services />
          <Gallery />
          <About />
          <Faq />
          <Contact />
        </main>
        <Footer />
      </div>
    </>
  )
}
