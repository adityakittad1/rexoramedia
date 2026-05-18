const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let site = null;
let autoSaveTimer = null;

const get = (path) => path.split(".").reduce((value, key) => value?.[key], site);
const set = (path, value) => {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((object, key) => object[key], site);
  target[last] = value;
};

const toast = (message) => {
  const element = $("[data-toast]");
  element.textContent = message;
  element.classList.add("is-visible");
  setTimeout(() => element.classList.remove("is-visible"), 2400);
};

const syncAnalytics = (mediaCount = null) => {
  $("[data-count-services]").textContent = site?.services?.length || 0;
  $("[data-count-videos]").textContent = site?.videos?.length || 0;
  $("[data-count-stats]").textContent = site?.stats?.length || 0;
  if (mediaCount !== null) $("[data-count-media]").textContent = mediaCount;
};

const youtubeThumb = (url) => {
  const match = String(url || "").match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  return match ? `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg` : "";
};

const youtubeId = (url) => {
  const match = String(url || "").match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
  return match ? match[1] : "";
};

const youtubeEmbed = (url) => {
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
  });
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
};

const saveSite = async (silent = false) => {
  const response = await fetch("/api/site", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(site),
  });
  if (!silent) toast(response.ok ? "Website updated" : "Save failed");
  return response.ok;
};

const queueVideoPublish = () => {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    const ok = await saveSite(true);
    if (ok) toast("Video showcase updated live");
  }, 650);
};

const bindInputs = () => {
  $$("[data-bind]").forEach((input) => {
    input.value = get(input.dataset.bind) || "";
    input.oninput = () => {
      set(input.dataset.bind, input.value);
      if (input.dataset.bind.startsWith("founder.")) renderFounder();
    };
  });
  $$("[data-bind-number]").forEach((input) => {
    input.value = get(input.dataset.bindNumber) ?? 0;
    input.oninput = () => set(input.dataset.bindNumber, Number(input.value));
  });
  $$("[data-bind-checkbox]").forEach((input) => {
    input.checked = Boolean(get(input.dataset.bindCheckbox));
    input.onchange = () => set(input.dataset.bindCheckbox, input.checked);
  });
  $$("[data-bind-array]").forEach((input) => {
    input.value = (get(input.dataset.bindArray) || []).join(", ");
    input.oninput = () => set(input.dataset.bindArray, input.value.split(",").map((item) => item.trim()).filter(Boolean));
  });
  renderYoutubePreview();
};

const renderYoutubePreview = () => {
  const thumb = youtubeThumb(site.hero.youtubeUrl);
  site.hero.youtubeThumb = thumb;
  $("[data-youtube-preview]").innerHTML = thumb
    ? `<p class="eyebrow">Auto Preview</p><img src="${thumb}" alt="YouTube thumbnail preview" />`
    : `<p>Paste a YouTube link to preview the auto-generated thumbnail.</p>`;
};

const serviceCard = (service, index) => `
  <article class="editor-card" draggable="true" data-service-index="${index}">
    <label>Category<input data-service-field="category" value="${service.category || ""}" /></label>
    <label>Icon Text<input data-service-field="icon" value="${service.icon || ""}" /></label>
    <label>Title<input data-service-field="title" value="${service.title}" /></label>
    <label>Description<textarea rows="3" data-service-field="description">${service.description}</textarea></label>
    <label>Image/Icon URL<input data-service-field="image" value="${service.image || ""}" /></label>
    <label><input type="checkbox" data-service-field="visible" ${service.visible ? "checked" : ""} /> Visible</label>
    <div class="editor-actions">
      <button type="button" data-service-up>Move Up</button>
      <button type="button" data-service-down>Move Down</button>
      <button type="button" data-service-delete>Remove</button>
    </div>
  </article>
`;

const renderServices = () => {
  $("[data-services-editor]").innerHTML = site.services.map(serviceCard).join("");
  syncAnalytics();
  $$("[data-service-index]").forEach((card) => {
    const index = Number(card.dataset.serviceIndex);
    card.querySelectorAll("[data-service-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.dataset.serviceField;
        site.services[index][field] = input.type === "checkbox" ? input.checked : input.value;
      });
      input.addEventListener("change", () => {
        if (input.type === "checkbox") site.services[index][input.dataset.serviceField] = input.checked;
      });
    });
    card.querySelector("[data-service-delete]").onclick = () => {
      site.services.splice(index, 1);
      renderServices();
    };
    card.querySelector("[data-service-up]").onclick = () => move(site.services, index, index - 1, renderServices);
    card.querySelector("[data-service-down]").onclick = () => move(site.services, index, index + 1, renderServices);
    card.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", index));
    card.addEventListener("dragover", (event) => event.preventDefault());
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      move(site.services, Number(event.dataTransfer.getData("text/plain")), index, renderServices);
    });
  });
};

const move = (items, from, to, callback) => {
  if (to < 0 || to >= items.length) return;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  callback();
};

const renderTestimonials = () => {
  $("[data-testimonials-editor]").innerHTML = site.testimonials.map((item, index) => `
    <article class="editor-card">
      <label>Quote<textarea rows="3" data-testimonial-field="quote">${item.quote}</textarea></label>
      <label>Name<input data-testimonial-field="name" value="${item.name}" /></label>
      <label>Role<input data-testimonial-field="role" value="${item.role}" /></label>
      <button type="button" data-testimonial-delete>Remove</button>
    </article>
  `).join("");
  $$("[data-testimonials-editor] .editor-card").forEach((card, index) => {
    card.querySelectorAll("[data-testimonial-field]").forEach((input) => {
      input.oninput = () => { site.testimonials[index][input.dataset.testimonialField] = input.value; };
    });
    card.querySelector("[data-testimonial-delete]").onclick = () => {
      site.testimonials.splice(index, 1);
      renderTestimonials();
    };
  });
};

const renderStats = () => {
  site.stats ||= [];
  $("[data-stats-editor]").innerHTML = site.stats.map((stat, index) => `
    <article class="editor-card">
      <label>Value<input data-stat-field="value" value="${stat.value || ""}" /></label>
      <label>Label<input data-stat-field="label" value="${stat.label || ""}" /></label>
      <label><input type="checkbox" data-stat-field="visible" ${stat.visible ? "checked" : ""} /> Visible</label>
      <button type="button" data-stat-delete>Remove</button>
    </article>
  `).join("");
  syncAnalytics();
  $$("[data-stats-editor] .editor-card").forEach((card, index) => {
    card.querySelectorAll("[data-stat-field]").forEach((input) => {
      const update = () => {
        site.stats[index][input.dataset.statField] = input.type === "checkbox" ? input.checked : input.value;
      };
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    });
    card.querySelector("[data-stat-delete]").onclick = () => {
      site.stats.splice(index, 1);
      renderStats();
    };
  });
};

const renderFounder = () => {
  site.founder ||= { name: "", role: "", bio: "", image: "", socials: [] };
  const preview = $("[data-founder-preview]");
  const image = site.founder.image || "";
  preview.innerHTML = `
    <div class="founder-preview-media">
      ${/\.(mp4|webm|ogg)$/i.test(image)
        ? `<video src="${image}" autoplay muted loop playsinline></video>`
        : image
          ? `<img src="${image}" alt="${site.founder.name || "Founder"}" />`
          : "<span>No founder media selected</span>"}
    </div>
    <div>
      <p class="eyebrow">Live Preview</p>
      <h3>${site.founder.name || "Founder Name"}</h3>
      <strong>${site.founder.role || "Designation"}</strong>
      <p>${site.founder.bio || "Founder description will appear here."}</p>
    </div>
  `;

  $("[data-founder-socials-editor]").innerHTML = (site.founder.socials || []).map((social, index) => `
    <article class="editor-card">
      <label>Label<input data-founder-social-field="label" value="${social.label || ""}" /></label>
      <label>URL<input data-founder-social-field="url" value="${social.url || ""}" /></label>
      <label><input type="checkbox" data-founder-social-field="visible" ${social.visible ? "checked" : ""} /> Visible</label>
      <button type="button" data-founder-social-delete>Remove</button>
    </article>
  `).join("");

  $$("[data-founder-socials-editor] .editor-card").forEach((card, index) => {
    card.querySelectorAll("[data-founder-social-field]").forEach((input) => {
      const update = () => {
        site.founder.socials[index][input.dataset.founderSocialField] = input.type === "checkbox" ? input.checked : input.value;
      };
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    });
    card.querySelector("[data-founder-social-delete]").onclick = () => {
      site.founder.socials.splice(index, 1);
      renderFounder();
    };
  });
};

const renderTeam = () => {
  $("[data-team-editor]").innerHTML = site.team.map((item, index) => `
    <article class="editor-card">
      <label>Name<input data-team-field="name" value="${item.name}" /></label>
      <label>Role<input data-team-field="role" value="${item.role}" /></label>
      <label>Image URL<input data-team-field="image" value="${item.image || ""}" /></label>
      <button type="button" data-team-delete>Remove</button>
    </article>
  `).join("");
  $$("[data-team-editor] .editor-card").forEach((card, index) => {
    card.querySelectorAll("[data-team-field]").forEach((input) => {
      input.oninput = () => { site.team[index][input.dataset.teamField] = input.value; };
    });
    card.querySelector("[data-team-delete]").onclick = () => {
      site.team.splice(index, 1);
      renderTeam();
    };
  });
};

const renderVideos = () => {
  site.videos ||= [];
  $("[data-videos-editor]").innerHTML = site.videos.map((video, index) => `
    <article class="editor-card" draggable="true" data-video-index="${index}">
      <div class="video-admin-preview">
        ${youtubeId(video.url)
          ? `<iframe src="${youtubeEmbed(video.url)}" title="${video.title || "Rexora video"}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
          : video.thumbnail
            ? `<img src="${video.thumbnail}" alt="${video.title}" />`
            : "<span>Paste a YouTube link to create a live preview</span>"}
      </div>
      <label>YouTube Link<input data-video-field="url" value="${video.url || ""}" /></label>
      <label>Title<input data-video-field="title" value="${video.title || ""}" /></label>
      <label>Description<textarea rows="3" data-video-field="description">${video.description || ""}</textarea></label>
      <label>Thumbnail<input data-video-field="thumbnail" value="${video.thumbnail || ""}" /></label>
      <label><input type="checkbox" data-video-field="visible" ${video.visible ? "checked" : ""} /> Visible</label>
      <div class="editor-actions">
        <button type="button" data-video-generate>Generate Preview</button>
        <button type="button" data-video-up>Move Up</button>
        <button type="button" data-video-down>Move Down</button>
        <button type="button" data-video-delete>Delete</button>
      </div>
    </article>
  `).join("");
  syncAnalytics();

  $$("[data-video-index]").forEach((card) => {
    const index = Number(card.dataset.videoIndex);
    card.querySelectorAll("[data-video-field]").forEach((input) => {
      const update = (shouldRefresh = false) => {
        site.videos[index][input.dataset.videoField] = input.type === "checkbox" ? input.checked : input.value;
        if (input.dataset.videoField === "url") {
          const video = site.videos[index];
          const id = youtubeId(video.url);
          video.thumbnail = youtubeThumb(video.url);
          if (id && !video.title) video.title = `Rexora Video ${id}`;
          queueVideoPublish();
          if (shouldRefresh && id) renderVideos();
        }
      };
      input.addEventListener("input", () => update(false));
      input.addEventListener("change", () => update(true));
      input.addEventListener("paste", () => setTimeout(() => update(true), 0));
    });
    card.querySelector("[data-video-generate]").onclick = () => {
      const video = site.videos[index];
      const id = youtubeId(video.url);
      video.thumbnail = youtubeThumb(video.url);
      if (!video.title) video.title = id ? `YouTube Video ${id}` : "Rexora Video";
      renderVideos();
      queueVideoPublish();
    };
    card.querySelector("[data-video-delete]").onclick = () => {
      site.videos.splice(index, 1);
      renderVideos();
      queueVideoPublish();
    };
    card.querySelector("[data-video-up]").onclick = () => move(site.videos, index, index - 1, () => { renderVideos(); queueVideoPublish(); });
    card.querySelector("[data-video-down]").onclick = () => move(site.videos, index, index + 1, () => { renderVideos(); queueVideoPublish(); });
    card.addEventListener("dragstart", (event) => event.dataTransfer.setData("text/plain", index));
    card.addEventListener("dragover", (event) => event.preventDefault());
    card.addEventListener("drop", (event) => {
      event.preventDefault();
      move(site.videos, Number(event.dataTransfer.getData("text/plain")), index, () => { renderVideos(); queueVideoPublish(); });
    });
  });
};

const renderMedia = async () => {
  const response = await fetch("/api/media");
  if (!response.ok) return;
  const { files } = await response.json();
  syncAnalytics(files.length);
  $("[data-media-grid]").innerHTML = files.map((file) => {
    const isVideo = /\.(mp4|webm|ogg)$/i.test(file.name);
    return `
      <article class="media-item">
        ${isVideo ? `<video src="${file.url}" controls></video>` : `<img src="${file.url}" alt="${file.name}" />`}
        <code>${file.url}</code>
        <button type="button" data-delete-media="${file.name}">Delete</button>
      </article>
    `;
  }).join("");
  $$("[data-delete-media]").forEach((button) => {
    button.onclick = async () => {
      await fetch(`/api/media?name=${encodeURIComponent(button.dataset.deleteMedia)}`, { method: "DELETE" });
      toast("Media deleted");
      renderMedia();
    };
  });
};

const uploadFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = async () => {
    const response = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, type: file.type, data: reader.result }),
    });
    response.ok ? resolve(response.json()) : reject(new Error("Upload failed"));
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const bindActions = () => {
  $("[data-tabs]").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (!tab) return;
    $$("[data-tab]").forEach((button) => button.classList.toggle("is-active", button === tab));
    $$("[data-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.panel === tab.dataset.tab));
  });
  $("[data-youtube-input]").addEventListener("input", renderYoutubePreview);
  $("[data-add-service]").onclick = () => {
    site.services.push({ id: crypto.randomUUID(), title: "New Service", description: "Describe this service.", image: "", visible: true });
    renderServices();
  };
  $("[data-add-testimonial]").onclick = () => {
    site.testimonials.push({ quote: "Add a testimonial quote.", name: "Client", role: "Company" });
    renderTestimonials();
  };
  $("[data-add-stat]").onclick = () => {
    site.stats ||= [];
    site.stats.push({ value: "1+", label: "New Stat", visible: true });
    renderStats();
  };
  $("[data-add-founder-social]").onclick = () => {
    site.founder ||= { socials: [] };
    site.founder.socials ||= [];
    site.founder.socials.push({ label: "Social", url: "https://", visible: true });
    renderFounder();
  };
  $("[data-founder-upload]").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const uploaded = await uploadFile(file);
    site.founder.image = uploaded.url;
    bindInputs();
    renderFounder();
    toast("Founder image uploaded");
  });
  $("[data-add-video]").onclick = () => {
    site.videos ||= [];
    site.videos.push({
      id: crypto.randomUUID(),
      title: "",
      url: "",
      thumbnail: "",
      description: "",
      visible: true,
    });
    renderVideos();
    queueVideoPublish();
  };
  $("[data-add-team]").onclick = () => {
    site.team.push({ name: "Team Member", role: "Role", image: "" });
    renderTeam();
  };
  $("[data-upload]").addEventListener("change", async (event) => {
    for (const file of event.target.files) await uploadFile(file);
    toast("Media uploaded");
    renderMedia();
  });
  $("[data-save]").onclick = async () => {
    await saveSite();
  };
  $("[data-logout]").onclick = async () => {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/admin/login";
  };
};

const boot = async () => {
  const me = await fetch("/api/me").then((response) => response.json());
  if (!me.ok) return location.href = "/admin/login";
  site = await fetch("/api/site").then((response) => response.json());
  bindInputs();
  bindActions();
  renderServices();
  renderStats();
  renderFounder();
  renderTestimonials();
  renderTeam();
  renderVideos();
  renderMedia();
};

boot();
