/* App shell: one root element, four screens, no framework. */
(function (WT) {
  "use strict";

  var root;
  var teardown = null;

  function swap(fn) {
    if (teardown) {
      teardown();
      teardown = null;
    }
    // Any guard belonged to the screen being replaced.
    if (WT.shell) WT.shell.clearGuard();
    WT.ui.clear(root);
    fn();
    window.scrollTo(0, 0);
  }

  /* The three tabs. Each is a top-level screen; everything else is reached
     from inside one of them and returns to it. */
  function showHome() {
    WT.shell.go("play");
  }

  function renderPlay() {
    swap(function () {
      WT.screens.home.render(root, openMode);
      document.title = "Word trainer";
    });
  }

  function renderFriends() {
    swap(function () {
      WT.screens.friends.render(root, showHome);
      document.title = "Friends";
    });
  }

  function renderProfile() {
    swap(function () {
      WT.screens.profile.render(root);
      document.title = "Profile";
    });
  }

  /* Home hands back a mode id. Adding a mode means adding a case here and an
     entry in js/screens/home.js — nothing else. */
  function openMode(id) {
    if (id === "path") showPath();
    else if (id === "drill") showDrillMenu();
    else if (id === "daily") showDaily();
    else if (id === "review") showReview();
    else if (id === "game") showGameMenu();
    else if (id === "strategy") showStrategyIntro();
  }

  function showStrategyIntro() {
    swap(function () {
      WT.screens.strategy.renderIntro(root, showStrategyPuzzle, showHome);
      document.title = "The best play";
    });
  }

  function showStrategyPuzzle() {
    var index = WT.strategy.nextIndex();
    if (index < 0) return showStrategyIntro();
    swap(function () {
      teardown = WT.screens.strategy.renderPuzzle(root, index, showStrategyPuzzle, showHome);
      document.title = "The best play";
    });
  }

  function showGameMenu() {
    swap(function () {
      WT.screens.game.renderMenu(root, startGame, showHome);
      document.title = "Play a game";
    });
  }

  function startGame(levelId) {
    var game = WT.game.create({});
    /* The live game, reachable from outside. tools/game_check.js drives a real
       game through the real screen with it, which is the only way to test the
       turn loop without reimplementing the screen in the test. */
    WT.currentGame = game;
    swap(function () {
      teardown = WT.screens.game.renderGame(root, game, levelId, showGameOver, showGameMenu);
      WT.shell.setGuard(function () {
        return window.confirm("Leave this game? It will not be saved.");
      });
      document.title = "Game — " + WT.opponent.levelById(levelId).name;
    });
  }

  function showGameOver(game, level) {
    swap(function () {
      teardown = WT.screens.game.renderOver(root, game, level, startGame, showHome);
      document.title = "Game over";
    });
    var s = game.state();
    WT.ui.say("Game over. " + s.scores[0] + " to " + s.scores[1] + ".");
  }

  /* Review has no menu: either something is due or it isn't. */
  function showReview() {
    if (!WT.review.dueCount()) {
      swap(function () {
        WT.screens.review.renderEmpty(root, showHome);
        document.title = "Review";
      });
      return;
    }
    swap(function () {
      teardown = WT.screens.review.renderSession(
        root,
        function (results, asked) {
          showReviewResults(results, asked);
        },
        showHome
      );
      document.title = "Review";
    });
  }

  function showReviewResults(results, asked) {
    swap(function () {
      WT.screens.review.renderResults(root, results, asked, showReview, showHome);
      document.title = "Review — result";
    });
    WT.ui.say("Review over. " + results.correct + " of " + results.total + " right.");
  }

  function showDaily() {
    swap(function () {
      // The daily listens for resize to keep its board square, so it hands back
      // a teardown like the quiz screens do.
      teardown = WT.screens.daily.render(root, showHome);
      document.title = "Today's board";
    });
  }

  function showDrillMenu() {
    swap(function () {
      WT.screens.drill.renderMenu(root, showDrill, showHome);
      document.title = "Unscramble";
    });
  }

  function showDrill(length) {
    swap(function () {
      WT.shell.setGuard(function () {
        return window.confirm("Leave the drill? This round won't be scored.");
      });
      teardown = WT.screens.drill.renderRound(
        root,
        length,
        function (summary) {
          showDrillResults(summary);
        },
        function () {
          if (window.confirm("Leave the drill? This round won't be scored.")) showDrillMenu();
        }
      );
      document.title = length + "-letter unscramble";
    });
  }

  function showDrillResults(summary) {
    swap(function () {
      WT.screens.drill.renderResults(
        root,
        summary,
        function () {
          showDrill(summary.length);
        },
        showDrillMenu
      );
      document.title = "Unscramble — result";
    });
    WT.ui.say("Round over. " + summary.correct + " of " + summary.total + " solved.");
  }

  function showPath() {
    swap(function () {
      WT.screens.path.render(root, openLevel, showHome);
      document.title = "Learn the words";
    });
  }

  function openLevel(level) {
    if (level.steps.indexOf("teach") !== -1) showTeach(level);
    else showQuiz(level);
  }

  /* A level's `kind` picks which pair of screens runs it. Everything without a
     kind is the standard word study + valid/invalid quiz. */
  function screensFor(level) {
    if (level.kind === "stems") {
      return {
        teach: WT.screens.stems.renderTeach,
        quiz: WT.screens.stems.renderQuiz,
        results: WT.screens.stems.renderResults,
        recordWords: false
      };
    }
    return {
      teach: WT.screens.teach.render,
      quiz: WT.screens.quiz.render,
      results: WT.screens.quiz.renderResults,
      recordWords: true
    };
  }

  function showTeach(level) {
    swap(function () {
      screensFor(level).teach(
        root,
        level,
        function () {
          showQuiz(level);
        },
        showPath
      );
      document.title = level.title + " — study";
    });
  }

  function showQuiz(level) {
    swap(function () {
      teardown = screensFor(level).quiz(
        root,
        level,
        function (results) {
          showResults(level, results);
        },
        function () {
          if (window.confirm("Leave the quiz? This attempt won't be scored.")) showPath();
        }
      );
      WT.shell.setGuard(function () {
        return window.confirm("Leave the quiz? This attempt won't be scored.");
      });
      document.title = level.title + " — quiz";
    });
  }

  function showResults(level, results) {
    var passed = results.accuracy >= level.quiz.passAccuracy;
    if (passed) WT.levels.complete(level, results.accuracy);
    else WT.levels.recordAttempt(level, results.accuracy);

    swap(function () {
      screensFor(level).results(
        root,
        level,
        results,
        function () {
          showQuiz(level);
        },
        showPath
      );
      document.title = level.title + " — result";
    });
    WT.ui.say(
      (passed ? "Level cleared. " : "Not cleared. ") +
        results.correct +
        " of " +
        results.total +
        " correct."
    );
  }

  function boot() {
    root = document.getElementById("app");
    try {
      WT.lex.init();
    } catch (e) {
      root.textContent =
        "The word list failed to load. If you opened this file directly, try serving " +
        "the folder over http instead.";
      return;
    }
    WT.shell.mount({
      handlers: { play: renderPlay, friends: renderFriends, profile: renderProfile }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window.WT || (window.WT = {}));
