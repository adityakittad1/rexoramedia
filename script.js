const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let site = null;
let typingIndex = 0;
let typingTimer = null;

const mediaMarkup = (url, alt = "") => {
  if (!url) return "";
  if (/\.(mp4|webm|ogg)$/i.test(url)) {
    return `<video src="${url}" autoplay muted loop playsinline></video>`;
  }
  return `<img src="${url}" alt="${alt}" loading="lazy" decoding="async" />`;
};

const youtubeThumb = (url) => {
  const match = String(url || "").match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  return match ? `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg` : "";
};

const youtubeId = (url) => {
  const match = String(url || "").match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  return match ? match[1] : "";
};

const youtubeEmbed = (url, index) => {
  const id = youtubeId(url);
  if (!id) return "";
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    loop: "1",
    playlist: id,
    playsinline: "1",
    enablejsapi: "1",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
  });
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
};

const applyBranding = ({ branding, hero, animations }) => {
  const root = document.documentElement;
  root.style.setProperty("--bg", branding.colors.background);
  root.style.setProperty("--surface", branding.colors.surface);
  root.style.setProperty("--text", branding.colors.text);
  root.style.setProperty("--muted", branding.colors.muted);
  root.style.setProperty("--primary", branding.colors.primary);
  root.style.setProperty("--secondary", branding.colors.secondary);
  root.style.setProperty("--accent", branding.colors.accent);
  root.style.setProperty("--font", `${branding.font}, Inter, system-ui, sans-serif`);
  root.style.setProperty("--display", `${branding.displayFont}, Impact, sans-serif`);
  root.style.setProperty("--hero-dark", hero.overlayDarkness);
  root.style.setProperty("--hero-blur", `${hero.overlayBlur}px`);
  $("[data-logo-text]").textContent = branding.logoText || branding.name;
  if (branding.logoUrl) $("[data-logo-symbol]").innerHTML = `<img src="${branding.logoUrl}" alt="" />`;
  document.body.classList.toggle("no-motion", !animations.enabled);
  $("[data-cursor]").style.display = animations.cursorGlow ? "block" : "none";
  $("[data-particles]").style.display = animations.particles ? "block" : "none";
  $("[data-luxury-scene]").style.display = animations.enabled ? "block" : "none";
};

const renderSite = () => {
  applyBranding(site);
  const { hero, content, stats = [], founder, services, videos = [], testimonials, team, contact } = site;
  const heroImage = hero.youtubeUrl ? youtubeThumb(hero.youtubeUrl) : hero.backgroundMedia;
  $("[data-hero-media]").innerHTML = mediaMarkup(heroImage, "Rexora hero media");
  $("[data-reel-media]").innerHTML = mediaMarkup(heroImage, "Rexora reel media");
  $("[data-hero-heading]").textContent = hero.heading;
  $("[data-hero-subheading]").textContent = hero.subheading;
  $("[data-primary-cta]").textContent = hero.primaryCta;
  $("[data-secondary-cta]").textContent = hero.secondaryCta;
  $("[data-intro-headline]").textContent = content.introHeadline;
  $("[data-intro-text]").textContent = content.introText;
  $("[data-scale-headline]").textContent = content.scaleHeadline;
  $("[data-scale-text]").textContent = content.scaleText;
  $("[data-footer-headline]").textContent = content.footerHeadline;
  $("[data-footer-text]").textContent = content.footerText;
  $("[data-contact-email]").textContent = contact.email;
  $("[data-contact-email]").href = `mailto:${contact.email}`;
  $("[data-contact-phone]").textContent = contact.phone;
  $("[data-contact-phone]").href = `tel:${contact.phone.replace(/\s/g, "")}`;
  $("[data-contact-location]").textContent = contact.location;
  const whatsappLink = `https://wa.me/91${String(contact.whatsapp || contact.phone || "").replace(/\D/g, "").replace(/^91/, "")}?text=${encodeURIComponent(contact.whatsappMessage || "Hello Rexora Media, I want to know more about your services.")}`;
  $("[data-whatsapp]").href = whatsappLink;
  $("[data-instagram-cta]").href = contact.instagram;
  $("[data-socials]").innerHTML = ["instagram", "youtube", "linkedin"]
    .filter((key) => contact[key])
    .map((key) => `<a href="${contact[key]}" target="_blank" rel="noreferrer">${key}</a>`)
    .join("");

  $("[data-stats]").innerHTML = stats
    .filter((stat) => stat.visible)
    .map((stat) => `
      <article class="stat-card reveal">
        <strong>${stat.value}</strong>
        <span>${stat.label}</span>
      </article>
    `)
    .join("");

  $("[data-services]").innerHTML = services
    .filter((service) => service.visible)
    .map((service, index) => `
      <article class="service-card reveal" data-tilt>
        <div class="service-icon-wrap">
          <span class="service-icon">${service.icon || String(index + 1).padStart(2, "0")}</span>
        </div>
        ${mediaMarkup(service.image, service.title)}
        <span>${service.category || "Rexora Media"}</span>
        <h3>${service.title}</h3>
        <p>${service.description}</p>
      </article>
    `)
    .join("");

  const featuredWork = services.filter((service) => service.visible).slice(0, 3);
  $("[data-work-cards]").innerHTML = featuredWork
    .map((service, index) => `
      <article class="work-card reveal" data-tilt>
        <div class="work-media">
          ${mediaMarkup(service.image, service.title)}
          <span>${String(index + 1).padStart(2, "0")}</span>
        </div>
        <div>
          <small>${service.category || "Rexora System"}</small>
          <h3>${service.title}</h3>
          <p>${service.description}</p>
        </div>
      </article>
    `)
    .join("");

  $("[data-testimonials]").innerHTML = testimonials.map((item) => `
    <article class="testimonial-card reveal">
      <p>${item.quote}</p>
      <strong>${item.name}<br /><span>${item.role}</span></strong>
    </article>
  `).join("");

  $("[data-team]").innerHTML = team.map((item) => `
    <article class="team-card reveal">
      ${item.image ? mediaMarkup(item.image, item.name) : `<div class="team-avatar">${item.name.slice(0, 2)}</div>`}
      <div>
        <h3>${item.name}</h3>
        <p>${item.role}</p>
      </div>
    </article>
  `).join("");

  $("[data-videos]").innerHTML = videos
    .filter((video) => video.visible)
    .map((video, index) => `
      <article class="video-card live-video-card reveal" data-video-url="${video.url}">
        <div class="video-live-frame">
          <iframe
            data-youtube-player
            src="${youtubeEmbed(video.url, index)}"
            title="${video.title}"
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowfullscreen
          ></iframe>
          <img class="video-poster-fallback" src="${video.thumbnail || youtubeThumb(video.url)}" alt="${video.title}" loading="lazy" />
          <button class="sound-toggle magnetic" type="button" data-sound-toggle aria-label="Turn sound on">Sound Off</button>
        </div>
        <div>
          <small>${String(index + 1).padStart(2, "0")} / Live Video Preview</small>
          <h3>${video.title}</h3>
          <p>${video.description || ""}</p>
        </div>
      </article>
    `)
    .join("");
  $("[data-videos]").classList.toggle("is-empty", !videos.filter((video) => video.visible).length);

  if (founder) {
    $("[data-founder-image]").innerHTML = mediaMarkup(founder.image, founder.name);
    $("[data-founder-name]").textContent = founder.name;
    $("[data-founder-role]").textContent = founder.role;
    $("[data-founder-bio]").textContent = founder.bio;
    $("[data-founder-socials]").innerHTML = (founder.socials || [])
      .filter((social) => social.visible)
      .map((social) => `<a class="magnetic" href="${social.url}" target="_blank" rel="noreferrer">${social.label}</a>`)
      .join("");
  }

  startTyping(hero.typing);
  observeReveals();
  bindTilt();
  bindVideos();
};

const startTyping = (words) => {
  clearInterval(typingTimer);
  const target = $("[data-typing]");
  target.textContent = words[0] || "Stories";
  typingTimer = setInterval(() => {
    typingIndex = (typingIndex + 1) % words.length;
    target.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 360 });
    target.textContent = words[typingIndex];
  }, 1800);
};

const observeReveals = () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("is-visible");
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.04 });
  $$(".reveal").forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.top < innerHeight * 0.95 && rect.bottom > 0) element.classList.add("is-visible");
    observer.observe(element);
  });
};

const bindTilt = () => {
  $$("[data-tilt]").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-8px)`;
    });
    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
    });
  });
};

const bindChrome = () => {
  const header = $("[data-header]");
  const navToggle = $("[data-nav-toggle]");
  const nav = $("[data-nav]");
  const cursor = $("[data-cursor]");
  window.addEventListener("scroll", () => header.classList.toggle("is-scrolled", scrollY > 20), { passive: true });
  navToggle.addEventListener("click", () => {
    const open = header.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
  nav.addEventListener("click", () => header.classList.remove("is-open"));
  document.addEventListener("pointermove", (event) => {
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
  });
  $$(".magnetic").forEach((element) => {
    element.addEventListener("pointermove", (event) => {
      const rect = element.getBoundingClientRect();
      element.style.transform = `translate(${(event.clientX - rect.left - rect.width / 2) * 0.18}px, ${(event.clientY - rect.top - rect.height / 2) * 0.18}px)`;
    });
    element.addEventListener("pointerleave", () => { element.style.transform = ""; });
  });
  $(".secret-brand").addEventListener("click", (event) => {
    event.preventDefault();
    document.body.classList.add("secret-exit");
    setTimeout(() => location.assign("/admin/login"), 520);
  });
};

const bindClock = () => {
  const tick = () => {
    const now = new Date();
    $("[data-clock]").textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((value) => String(value).padStart(2, "0"))
      .join(":");
  };
  tick();
  setInterval(tick, 1000);
};

const bindParticles = () => {
  const canvas = $("[data-particles]");
  const ctx = canvas.getContext("2d");
  const dots = Array.from({ length: 64 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 2 + 0.6, s: Math.random() * 0.35 + 0.08 }));
  const resize = () => {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
  };
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dots.forEach((dot) => {
      dot.y -= dot.s / 1000;
      if (dot.y < -0.05) dot.y = 1.05;
      ctx.beginPath();
      ctx.arc(dot.x * canvas.width, dot.y * canvas.height, dot.r * devicePixelRatio, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.42)";
      ctx.fill();
    });
    requestAnimationFrame(draw);
  };
  resize();
  addEventListener("resize", resize);
  draw();
};

const bindLuxuryScene = () => {
  const canvas = $("[data-luxury-scene]");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const pointer = { x: 0, y: 0 };
  const panels = Array.from({ length: 26 }, (_, index) => ({
    angle: (index / 26) * Math.PI * 2,
    radius: 0.38 + Math.random() * 0.28,
    height: Math.random() * 0.7 - 0.35,
    speed: 0.18 + Math.random() * 0.28,
    size: 0.018 + Math.random() * 0.034,
    phase: Math.random() * Math.PI * 2,
  }));

  const resize = () => {
    canvas.width = innerWidth * devicePixelRatio;
    canvas.height = innerHeight * devicePixelRatio;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
  };

  const project = (x, y, z) => {
    const depth = 1.6 / (1.6 + z);
    return {
      x: canvas.width * (0.66 + (x + pointer.x * 0.04) * depth),
      y: canvas.height * (0.46 + (y + pointer.y * 0.03) * depth),
      scale: depth,
    };
  };

  const line = (points, color, width) => {
    ctx.beginPath();
    points.forEach((point, index) => {
      index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width * devicePixelRatio;
    ctx.stroke();
  };

  const drawGrid = (time) => {
    for (let i = 0; i < 22; i += 1) {
      const z = i / 7 + ((time * 0.00035) % 0.14);
      const left = project(-1.5, 0.48, z);
      const right = project(0.7, 0.48, z);
      line([left, right], "rgba(0,245,212,0.11)", 1);
    }
    for (let i = -12; i <= 8; i += 1) {
      const near = project(i * 0.095, 0.52, 0.1);
      const far = project(i * 0.28, 0.5, 3.2);
      line([near, far], "rgba(255,255,255,0.055)", 1);
    }
  };

  const drawRibbons = (time) => {
    for (let ribbon = 0; ribbon < 4; ribbon += 1) {
      const points = [];
      const offset = ribbon * Math.PI * 0.52;
      for (let i = 0; i < 140; i += 1) {
        const t = i / 139;
        const angle = t * Math.PI * 2.5 + time * 0.00042 + offset;
        const radius = 0.26 + Math.sin(t * Math.PI * 2 + time * 0.00032 + ribbon) * 0.07;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle * 0.74 + offset) * 0.19 - 0.03;
        const z = Math.sin(angle) * 0.42 + 0.7 + t * 0.2;
        points.push(project(x, y, z));
      }
      const hue = ribbon % 2 ? "255,77,46" : "0,245,212";
      line(points, `rgba(${hue},0.22)`, 1.8);
    }
  };

  const drawPanels = (time) => {
    panels.forEach((panel) => {
      const angle = panel.angle + time * 0.00018 * panel.speed;
      const x = Math.cos(angle) * panel.radius;
      const y = panel.height + Math.sin(time * 0.001 + panel.phase) * 0.025;
      const z = Math.sin(angle) * 0.62 + 0.85;
      const point = project(x, y, z);
      const size = Math.max(8, canvas.width * panel.size * point.scale);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(angle + time * 0.00016);
      ctx.fillStyle = "rgba(255,255,255,0.055)";
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1 * devicePixelRatio;
      ctx.fillRect(-size / 2, -size * 0.32, size, size * 0.64);
      ctx.strokeRect(-size / 2, -size * 0.32, size, size * 0.64);
      ctx.restore();
    });
  };

  const draw = (time = 0) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createRadialGradient(canvas.width * 0.7, canvas.height * 0.42, 0, canvas.width * 0.7, canvas.height * 0.42, canvas.width * 0.68);
    gradient.addColorStop(0, "rgba(0,245,212,0.16)");
    gradient.addColorStop(0.38, "rgba(139,92,246,0.08)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid(time);
    ctx.shadowBlur = 26 * devicePixelRatio;
    ctx.shadowColor = "rgba(0,245,212,0.5)";
    drawRibbons(time);
    ctx.shadowBlur = 18 * devicePixelRatio;
    ctx.shadowColor = "rgba(255,77,46,0.28)";
    drawPanels(time);
    requestAnimationFrame(draw);
  };

  addEventListener("pointermove", (event) => {
    pointer.x = event.clientX / innerWidth - 0.5;
    pointer.y = event.clientY / innerHeight - 0.5;
  }, { passive: true });
  addEventListener("resize", resize);
  resize();
  draw();
};

const bindVideos = () => {
  const modal = $("[data-video-modal]");
  const frame = $("[data-modal-frame]");
  $$("[data-video-url]").forEach((card) => {
    card.addEventListener("click", () => {
      const id = youtubeId(card.dataset.videoUrl);
      if (!id) return;
      frame.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1&rel=0" title="Rexora video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
      modal.showModal();
    });
  });
  $$("[data-sound-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const iframe = button.closest(".video-card").querySelector("[data-youtube-player]");
      const isOn = button.dataset.sound === "on";
      iframe.contentWindow?.postMessage(JSON.stringify({
        event: "command",
        func: isOn ? "mute" : "unMute",
        args: [],
      }), "*");
      button.dataset.sound = isOn ? "off" : "on";
      button.textContent = isOn ? "Sound Off" : "Sound On";
      button.setAttribute("aria-label", isOn ? "Turn sound on" : "Turn sound off");
    });
  });
  $("[data-modal-close]").addEventListener("click", () => {
    modal.close();
    frame.innerHTML = "";
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.close();
      frame.innerHTML = "";
    }
  });
};

const boot = async () => {
  bindChrome();
  bindClock();
  bindParticles();
  bindLuxuryScene();
  site = await fetch("/api/site").then((response) => response.json());
  renderSite();
  setTimeout(() => $("[data-loader]").classList.add("is-hidden"), 700);
};

boot();
