# pi-omniroute

Extensão de provider para o [Pi Coding Agent](https://github.com/earendil-works/pi) que conecta o Pi ao [OmniRoute](https://github.com/diegosouzapw/OmniRoute) — um gateway de IA open-source que agrega 236+ providers em um único endpoint OpenAI-compatible.

## Recursos

- Registra o provider `omniroute` no Pi
- **Descoberta dinâmica de modelos** via `GET /v1/models` (modelos auto-routing são filtrados)
- Configuração via `/login omniroute` (interativo) ou variáveis de ambiente
- Credenciais persistidas no `~/.pi/agent/auth.json` do próprio Pi

## Instalação

Copie o arquivo para a pasta de extensões do Pi:

```bash
mkdir -p ~/.pi/agent/extensions
curl -fsSL https://raw.githubusercontent.com/IgorGuariroba/pi-omniroute/main/omniroute.ts \
  -o ~/.pi/agent/extensions/omniroute.ts
```

Ou clone o repositório:

```bash
git clone https://github.com/IgorGuariroba/pi-omniroute /tmp/pi-omniroute
cp /tmp/pi-omniroute/omniroute.ts ~/.pi/agent/extensions/
```

Em sessões do Pi já abertas, rode `/reload` para carregar a extensão.

## Configuração

Escolha uma das opções:

### A) Via `/login` (recomendado)

No Pi, execute:

```
/login omniroute
```

A extensão pergunta a URL do servidor e a API key.

### B) Via variáveis de ambiente

```bash
export OMNIROUTE_BASE_URL="http://<servidor>:20128/v1"
export OMNIROUTE_API_KEY="sk-..."
```

## Uso

Depois de configurado, selecione um modelo:

```
/model
```

Os modelos do OmniRoute aparecem sob o provider `omniroute`.

## Uso com PI WEB / Docker

Funciona normalmente em sessões do [PI WEB](https://github.com/jmfederico/pi-web). Em containers, monte `~/.pi` como volume persistente e defina as variáveis de ambiente `OMNIROUTE_BASE_URL` / `OMNIROUTE_API_KEY`, ou faça `/login omniroute` uma vez em qualquer sessão.

## Licença

[MIT](LICENSE)
