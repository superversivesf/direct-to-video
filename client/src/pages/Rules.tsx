export function Rules() {
  return (
    <div className="rules-page">
      <h1>How to Play Pitch Storm</h1>

      <section>
        <h2>Overview</h2>
        <p>
          Pitch Storm is a party game where players take turns acting as unprepared writers
          pitching terrible movie ideas to the world's worst executives. One player is the
          Executive each round — everyone else pitches movies, and the Executive picks the best one.
        </p>
      </section>

      <section>
        <h2>Components</h2>
        <ul>
          <li><strong>Plot Cards</strong> — story premises for your movie</li>
          <li><strong>Character Cards</strong> — characters in your movie</li>
          <li><strong>Note Cards</strong> — twist notes the Executive forces into your pitch</li>
        </ul>
        <p>Each movie is made from one Plot card and one Character card.</p>
      </section>

      <section>
        <h2>Setup</h2>
        <ol>
          <li>One player creates a room and shares the 4-letter room code with everyone.</li>
          <li>Other players join using the room code. Anyone can join as Audience to watch.</li>
          <li>The host clicks "Start Game" when everyone has joined.</li>
        </ol>
      </section>

      <section>
        <h2>Round Flow</h2>
        <h3>1. Setup</h3>
        <ul>
          <li>The Executive is chosen (first round: host, then rotates each round).</li>
          <li>The Executive draws 3 Note cards.</li>
          <li>Each Writer chooses to draw 3 Plot cards OR 3 Character cards (not both).</li>
        </ul>

        <h3>2. Build Your Movie</h3>
        <ul>
          <li>Each Writer selects 1 card from their hand to play (this is their chosen card).</li>
          <li>Each Writer draws 1 blind card from the <strong>opposite</strong> deck
            (if you drew Plot cards, your blind draw is from Character, and vice versa).</li>
          <li>You won't see your blind card until you start pitching!</li>
          <li>Click "Ready to Pitch" when you're set.</li>
        </ul>

        <h3>3. Pitching</h3>
        <ul>
          <li>Writers pitch one at a time, starting from the Executive's left.</li>
          <li>Your two cards are revealed — read them aloud and pitch your movie!</li>
          <li>You have <strong>45 seconds</strong> to pitch (the Executive controls the timer).</li>
          <li>At any point, the Executive can <strong>PAUSE</strong> the timer and play a
            <strong> Note card</strong>. The timer stays paused for 5 seconds so you can read
            the note and gather your thoughts, then auto-resumes.</li>
          <li>You must incorporate the Note into your pitch, no matter how bad it is!</li>
          <li>The pitch ends when the timer hits 0 OR the Executive clicks "End Pitch".</li>
          <li>After each pitch, the Executive refills their Note hand to 3 cards.</li>
        </ul>

        <h3>4. Pick the Winner</h3>
        <ul>
          <li>After all Writers have pitched, the Executive selects the winning movie.</li>
          <li>The winning Writer keeps the last Note card played on them as 1 point.
            If no Note was played, they take one from the deck.</li>
        </ul>
      </section>

      <section>
        <h2>Game End</h2>
        <p>
          The game ends when every player has taken one turn as Executive. The player with the
          most points wins! Ties are displayed as ties.
        </p>
      </section>

      <section>
        <h2>Writers' Room Variant (Coming Soon)</h2>
        <p>
          In the Writers' Room variant, players pitch TV show seasons instead of movies.
          The winner of each round becomes the Executive for the next round, and the winning
          pitch becomes canon — everyone builds on it in subsequent rounds. After 6 seasons,
          players pitch an epic finale movie.
        </p>
      </section>

      <section>
        <h2>Tips</h2>
        <ul>
          <li>Pitch verbally over your Zoom/Teams call — the app handles cards, timer, and scoring.</li>
          <li>The Executive can play multiple Notes during a single pitch — each one pauses the timer.</li>
          <li>If the Note deck runs out, the Executive draws fewer cards. The game continues.</li>
          <li>Don't overthink it — the best pitches are the ridiculous ones!</li>
        </ul>
      </section>

      <a href="/" className="rules-back-btn">← Back to Join</a>
    </div>
  );
}
