(function () {
  "use strict";

  var deck = document.getElementById("deck");
  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var dotNav = document.getElementById("dotNav");
  var progressFill = document.getElementById("progressFill");
  var countCurrent = document.getElementById("countCurrent");
  var countTotal = document.getElementById("countTotal");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");

  var total = slides.length;
  var current = 0;

  countTotal.textContent = String(total).padStart(2, "0");

  // Build dot navigation
  slides.forEach(function (slide, i) {
    var dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", "Go to slide " + (i + 1));
    dot.addEventListener("click", function () {
      goTo(i);
    });
    dotNav.appendChild(dot);
  });
  var dots = Array.prototype.slice.call(dotNav.children);

  function setActive(index) {
    current = index;
    dots.forEach(function (dot, i) {
      dot.classList.toggle("active", i === index);
    });
    countCurrent.textContent = String(index + 1).padStart(2, "0");
    progressFill.style.width = (total <= 1 ? 100 : (index / (total - 1)) * 100) + "%";
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === total - 1;
  }

  function goTo(index) {
    var clamped = Math.max(0, Math.min(total - 1, index));
    slides[clamped].scrollIntoView({ behavior: "smooth", block: "start" });
  }

  prevBtn.addEventListener("click", function () {
    goTo(current - 1);
  });
  nextBtn.addEventListener("click", function () {
    goTo(current + 1);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown") {
      e.preventDefault();
      goTo(current + 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") {
      e.preventDefault();
      goTo(current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      goTo(0);
    } else if (e.key === "End") {
      e.preventDefault();
      goTo(total - 1);
    }
  });

  // If the page was opened directly on a slide's hash, land there instantly
  // rather than animating from slide 1. Web fonts swap in asynchronously and
  // reflow slide heights, so re-settle once they're fully loaded too.
  // Deliberately set deck.scrollTop directly rather than calling
  // scrollIntoView: each slide is itself an internal scroll container now
  // (for the containment fallback), and scrollIntoView's own alignment pass
  // can race with scroll-snap settling against that nested scrollport,
  // occasionally landing a frame short/long of the slide's true offsetTop.
  function jumpToHash() {
    if (!window.location.hash) return;
    var target = document.querySelector(window.location.hash);
    var idx = target ? slides.indexOf(target) : -1;
    if (idx !== -1) {
      deck.scrollTop = target.offsetTop;
      setActive(idx);
    }
  }
  jumpToHash();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(jumpToHash);
  }

  // Track which slide is most in view
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio > 0.55) {
          var idx = slides.indexOf(entry.target);
          if (idx !== -1) setActive(idx);
        }
      });
    },
    { root: deck, threshold: [0.55] }
  );
  slides.forEach(function (slide) {
    observer.observe(slide);
  });

  if (!window.location.hash) {
    setActive(0);
  }
})();
