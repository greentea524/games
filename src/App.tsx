import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'

const WEB_GAMES = [
  {
    title: "Invasion",
    href: "https://greentea524.github.io/vite-project/space/",
    description: "Defend against waves of alien invaders. Features a multiplayer mode!",
  },
  {
    title: "Platformer",
    href: "https://greentea524.github.io/vite-project/platformer/",
    description:
      "A 2D side-scrolling adventure featuring a multiplayer 'Race a friend' mode.",
  },
  {
    title: "Big 2",
    href: "https://greentea524.github.io/vite-project/big2/",
    description: "Shed all 13 cards first in this classic climbing card game.",
  },
];

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <section id="web-games" style={{ padding: '48px 0' }}>
        <h2>Web Games</h2>
        <p style={{ marginBottom: '32px' }}>Check out some of our web games</p>
        <div className="games-grid">
          {WEB_GAMES.map((game) => (
            <div className="game-card" key={game.title}>
              <a
                className="game-link"
                href={game.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${game.title} (opens in a new tab)`}
              >
                <span className="game-link-title-row">
                  🎮 {game.title}
                </span>
                <span>↗</span>
              </a>
              <p className="game-link-description">
                {game.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="ticks"></div>

      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
          </p>
        </div>
        <button
          type="button"
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
      </section>

      <div className="ticks"></div>

      <section id="next-steps">
        <div id="docs">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
          <ul>
            <li>
              <a href="https://vite.dev/" target="_blank">
                <img className="logo" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a href="https://react.dev/" target="_blank">
                <img className="button-icon" src={reactLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2>Connect with us</h2>
          <p>Join the Vite community</p>
          <ul>
            <li>
              <a href="https://github.com/vitejs/vite" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#discord-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#bluesky-icon"></use>
                </svg>
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
