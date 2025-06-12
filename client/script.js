let socket = null;
let usuarioId = null;
let token = null;

// Detecta token e sala da URL (se existir)
const params = new URLSearchParams(window.location.search);
const sala = params.get("sala");
token = params.get("token");

// Inicializa o socket apenas na página de chat
if (window.location.pathname.includes("chat.html") && sala && token) {
  const payload = JSON.parse(atob(token.split('.')[1]));
  usuarioId = payload.id;
  socket = io({
    auth: { usuario: { id: usuarioId }, sala }
  });

  // Recebe mensagens do servidor
  socket.on("mensagem", ({ texto, usuario }) => {
    const div = document.createElement("div");
    div.className = usuarioId === usuario.id ? "msg-eu" : "msg-outro";
    div.textContent = usuarioId === usuario.id ? texto : usuario.nome + ": " + texto;
    document.getElementById("mensagens")?.appendChild(div);
  });
}

// Login ou Registro
function conectar() {
  const nome = document.getElementById("nome").value;
  const senha = document.getElementById("senha").value;

  if (!nome || !senha) {
    alert("Preencha nome e senha.");
    return;
  }

  fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, senha }),
  })
    .then(async (res) => {
      if (res.status === 200) {
        const data = await res.json();
        token = data.token;
        const payload = JSON.parse(atob(token.split('.')[1]));
        usuarioId = payload.id;
        window.location.href = "/salas.html?token=" + token;
      } else if (res.status === 401) {
        fetch("/registrar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, senha }),
        })
          .then(() => {
            return fetch("/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nome, senha }),
            });
          })
          .then(async (res) => {
            if (res.status === 200) {
              const data = await res.json();
              token = data.token;
              const payload = JSON.parse(atob(token.split('.')[1]));
              usuarioId = payload.id;
              window.location.href = "/salas.html?token=" + token;
            } else {
              alert("Erro ao registrar e logar.");
            }
          });
      } else {
        alert("Erro ao fazer login.");
      }
    });
}

function deslogar() {
  window.location.href = "/index.html";
}

// SALAS
function mostrarCriarSala() {
  esconderTodos();
  document.getElementById("criarSalaForm").classList.remove("d-none");
}

function mostrarEntrarSala() {
  esconderTodos();
  document.getElementById("entrarSalaForm").classList.remove("d-none");
}

function esconderTodos() {
  document.getElementById("criarSalaForm").classList.add("d-none");
  document.getElementById("entrarSalaForm").classList.add("d-none");
  document.getElementById("salasUsuario").classList.add("d-none");
}

function criarSala() {
  const nomeSala = document.getElementById("novaSala").value;
  const senha = document.getElementById("senhaNovaSala").value;
  if (!nomeSala || !senha) return alert("Preencha todos os campos.");

  fetch("/salas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + getToken()
    },
    body: JSON.stringify({ numero: nomeSala, senha }),
  }).then(res => {
    if (res.status === 201) entrarNaSala(nomeSala);
    else alert("Erro ao criar sala");
  });
}

function entrarSala() {
  const nomeSala = document.getElementById("sala").value;
  const senha = document.getElementById("senhaSala").value;
  if (!nomeSala || !senha) return alert("Preencha todos os campos.");

  fetch("/salas/entrar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + getToken()
    },
    body: JSON.stringify({ numero: nomeSala, senha }),
  }).then(res => {
    if (res.status === 200) entrarNaSala(nomeSala);
    else alert("Senha incorreta ou sala inexistente.");
  });
}

function carregarSalasDoUsuario() {
  esconderTodos();
  fetch("/salas/usuario", {
    headers: {
      Authorization: "Bearer " + getToken()
    },
  })
    .then(res => res.json())
    .then(salas => {
      const botoes = document.getElementById("botoesSalas");
      botoes.innerHTML = "";
      salas.forEach(sala => {
        const btn = document.createElement("button");
        btn.className = "btn btn-outline-info m-1";
        btn.textContent = "Sala " + sala.numero;
        btn.onclick = () => entrarNaSala(sala.numero);
        botoes.appendChild(btn);
      });
      document.getElementById("salasUsuario").classList.remove("d-none");
    });
}

function entrarNaSala(numero) {
  window.location.href = "/chat.html?sala=" + numero + "&token=" + getToken();
}

// CHAT
function enviarMensagem() {
  const input = document.getElementById("mensagemInput");
  if (input && input.value.trim() !== "") {
    socket.emit("mensagem", input.value);
    input.value = "";
  }
}

function excluirSala() {
  const senha = prompt("Digite a senha padrão para excluir esta sala:");
  if (!senha) return;

  const sala = new URLSearchParams(window.location.search).get("sala");
  fetch("/salas/excluir", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + getToken()
    },
    body: JSON.stringify({ numero: sala, senha }),
  }).then(res => {
    if (res.status === 200) {
      alert("Sala excluída.");
      voltarAoMenu();
    } else {
      alert("Senha incorreta ou erro ao excluir.");
    }
  });
}

function voltarAoMenu() {
  window.location.href = "/salas.html?token=" + getToken();
}

function getToken() {
  if (!token) {
    const params = new URLSearchParams(window.location.search);
    token = params.get("token");
  }
  return token;
}

// Ao carregar a página de salas, esconder todos os blocos
window.onload = async function () {
  esconderTodos?.();

  if (window.location.pathname.includes("chat.html") && sala && token) {
    const payload = JSON.parse(atob(token.split('.')[1]));
    usuarioId = payload.id;

    const res = await fetch(`/mensagens/${sala}`, {
      headers: { Authorization: "Bearer " + token }
    });

    const historico = await res.json();
    historico.forEach(({ texto, nome, id }) => {
      const div = document.createElement("div");
      div.className = usuarioId === id ? "msg-eu" : "msg-outro";
      div.textContent = usuarioId === id ? texto : nome + ": " + texto;
      document.getElementById("mensagens")?.appendChild(div);
    });
  }
};
