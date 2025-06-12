const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});
const path = require("path");
app.use(express.static(path.resolve(__dirname, "..", "client")));

app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "..", "client", "index.html"));
});

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "segredo_padrao_inseguro";
const SENHA_PADRAO_EXCLUIR = process.env.SENHA_PADRAO_EXCLUIR || "123456";


// Utilitários
function autenticar(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.sendStatus(401);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = payload;
    next();
  } catch {
    res.sendStatus(403);
  }
}

// Registro de usuário
app.post("/registrar", async (req, res) => {
  const { nome, senha } = req.body;
  const existe = await db.query("SELECT id FROM usuarios WHERE nome = $1", [nome]);
  if (existe.rows.length === 0) {
    const hash = await bcrypt.hash(senha, 10);
    await db.query("INSERT INTO usuarios (nome, senha_hash) VALUES ($1, $2)", [nome, hash]);
  }
  res.sendStatus(200);
});

// Login

app.post("/login", async (req, res) => {
  const { nome, senha } = req.body;

  // Busca todos os usuários com o nome fornecido
  const resultado = await db.query("SELECT * FROM usuarios WHERE nome = $1", [nome]);

  // Se encontrar algum, verifica se alguma senha bate
  for (const usuario of resultado.rows) {
    const valido = await bcrypt.compare(senha, usuario.senha_hash);
    if (valido) {
      const token = jwt.sign({ id: usuario.id, nome: usuario.nome }, JWT_SECRET);
      return res.json({ token });
    }
  }

  // Se não encontrou nenhum com essa senha, cria novo usuário
  const hash = await bcrypt.hash(senha, 10);
  const novoUsuario = await db.query(
    "INSERT INTO usuarios (nome, senha_hash) VALUES ($1, $2) RETURNING id",
    [nome, hash]
  );
  const token = jwt.sign({ id: novoUsuario.rows[0].id, nome }, JWT_SECRET);
  res.json({ token });
});


// Criar ou acessar sala
app.post("/salas", autenticar, async (req, res) => {
  const { numero, senha } = req.body;
  const existe = await db.query("SELECT * FROM salas WHERE numero = $1", [numero]);
  if (existe.rows.length > 0) {
    if (existe.rows[0].senha !== senha) return res.status(403).send("Senha incorreta.");
    await registrarParticipacao(req.usuario.id, existe.rows[0].id);
    return res.status(200).send();
  }
  const nova = await db.query("INSERT INTO salas (numero, senha) VALUES ($1, $2) RETURNING id", [numero, senha]);
  await registrarParticipacao(req.usuario.id, nova.rows[0].id);
  res.status(201).send();
});

// Entrar em sala existente
app.post("/salas/entrar", autenticar, async (req, res) => {
  const { numero, senha } = req.body;
  const resultado = await db.query("SELECT * FROM salas WHERE numero = $1", [numero]);
  if (resultado.rows.length === 0) return res.sendStatus(404);
  const sala = resultado.rows[0];
  if (sala.senha !== senha) return res.sendStatus(403);
  await registrarParticipacao(req.usuario.id, sala.id);
  res.sendStatus(200);
});

// Listar salas acessadas
app.get("/salas/usuario", autenticar, async (req, res) => {
  const resultado = await db.query(`
    SELECT DISTINCT s.numero FROM salas s
    JOIN participacoes p ON s.id = p.sala_id
    WHERE p.usuario_id = $1
  `, [req.usuario.id]);
  res.json(resultado.rows);
});

// Excluir sala
app.post("/salas/excluir", autenticar, async (req, res) => {
  const { numero, senha } = req.body;
  if (senha !== SENHA_PADRAO_EXCLUIR) return res.sendStatus(403);
  await db.query("DELETE FROM salas WHERE numero = $1", [numero]);
  res.sendStatus(200);
});

// Participações únicas
async function registrarParticipacao(usuarioId, salaId) {
  const existe = await db.query(
    "SELECT 1 FROM participacoes WHERE usuario_id = $1 AND sala_id = $2",
    [usuarioId, salaId]
  );
  if (existe.rows.length === 0) {
    await db.query("INSERT INTO participacoes (usuario_id, sala_id) VALUES ($1, $2)", [usuarioId, salaId]);
  }
}
io.on("connection", (socket) => {
  const usuario = socket.handshake.auth?.usuario;
  const sala = socket.handshake.auth?.sala;

  if (usuario && sala) {
    socket.join(sala);

    socket.on("mensagem", async (texto) => {
      const salaResult = await db.query("SELECT id FROM salas WHERE numero = $1", [sala]);
      const salaId = salaResult.rows[0]?.id;
      if (!salaId) return;

      await db.query(
        "INSERT INTO mensagens (sala_id, usuario_id, texto) VALUES ($1, $2, $3)",
        [salaId, usuario.id, texto]
      );

      socket.to(sala).emit("mensagem", { texto, usuario }); // outros
      socket.emit("mensagem", { texto, usuario });           // próprio
    });
  }
});

app.get("/mensagens/:numero", autenticar, async (req, res) => {
  const numeroSala = req.params.numero;
  const salaResult = await db.query("SELECT id FROM salas WHERE numero = $1", [numeroSala]);
  const salaId = salaResult.rows[0]?.id;
  if (!salaId) return res.sendStatus(404);

  const mensagens = await db.query(`
    SELECT m.texto, u.nome, u.id
    FROM mensagens m
    JOIN usuarios u ON m.usuario_id = u.id
    WHERE m.sala_id = $1
    ORDER BY m.data ASC
  `, [salaId]);

  res.json(mensagens.rows);
});



app.get("/healthz", (req, res) => {
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Rodando na porta ${PORT}`);
});
