import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'

const WEB_GAMES = [
  {
    title: "Static",
    href: `${import.meta.env.BASE_URL}static/`,
    description: "A GBC-style top-down mystery/adventure game. Explore a small town where an old TV works like a portal.",
  },
  {
    title: "Cart & Crate",
    href: `${import.meta.env.BASE_URL}cart-crate/`,
    description:
      "A GBC-style Sokoban puzzle game. Help the courier animal push delivery carts and crates onto target tiles.",
  },
  {
    title: "Pocket Dungeon",
    href: `${import.meta.env.BASE_URL}pocket-dungeon/`,
    description:
      "A GBC-style turn-based roguelite dungeon crawler. Explore floors, fight monsters, and survive the depth.",
  },
  {
    title: "Lantern Keeper",
    href: `${import.meta.env.BASE_URL}lantern-keeper/`,
    description:
      "Light lanterns in a dark forest in this GBC-style puzzle-platformer. Double jump, dash, and wall-cling your way to the Crown.",
  },
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
  return (
    <>
      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <div>
          <h1>Web Games</h1>
          <p>Play retro GBC games and web arcade titles</p>
        </div>
      </section>

      <div className="ticks"></div>

      <section id="web-games" style={{ padding: '36px 0 48px' }}>
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

      <section id="github-section" style={{ padding: '48px 20px', textAlign: 'center' }}>
        <a
          className="github-btn"
          href="https://greentea524.github.io/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <svg
            className="button-icon"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="currentColor"
            style={{ marginRight: '8px', verticalAlign: 'middle', display: 'inline-block' }}
          >
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          Visit greentea524.github.io ↗
        </a>
      </section>

      <section id="spacer"></section>
    </>
  )
}

export default App
