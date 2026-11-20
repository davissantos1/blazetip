# Roteiro — vídeo demo BlazeTip (até 2 min, BCH BLAZE 2026)

Pré-requisitos: app rodando (`pnpm dev`), endereço de recebimento Chipnet
configurado e, para mostrar um evento real, carteira Chipnet com saldo de teste
e pairing/mural/overlay previamente conferidos. Use somente Chipnet nesta
gravação. Telas em inglês (público do hackathon).

| Tempo | Cena | Ação / fala |
|---|---|---|
| 0:00–0:15 | Landing page | “BlazeTip is a non-custodial BCH checkout, supporter wall and OBS alert. Tips go directly to the creator; BlazeTip never holds keys or funds.” |
| 0:15–0:30 | Checkout | Mostre o endereço Chipnet configurado, o valor e o trilho WizardConnect. “The creator sets the receiving address; the supporter reviews and signs in their own wallet.” |
| 0:30–1:05 | Pairing e prompt | Faça pairing e mostre no prompt Chipnet, destinatário, valor e fee antes de aprovar. “The app assembles the transaction and asks Fulcrum to broadcast. A receipt appears only after Fulcrum returns a TXID or verifies the exact transaction bytes under its derived TXID.” Não aprove se rede, destinatário ou valor estiverem incorretos. |
| 1:05–1:25 | Mural | Só depois de observar a transação na lista atualizada, mostre valor, memo `BLAZE:` e estado real. “The wall reads the creator’s on-chain activity from Fulcrum.” Não prometa atualização instantânea nem confirmação em bloco. |
| 1:25–1:45 | Overlay OBS | Mostre o alerta apenas se o evento observado o disparou. Em seguida, clique **Test Alert** e aponte o selo “TEST ALERT (DEMO)”: esse botão testa a cena, não representa pagamento. |
| 1:45–2:00 | Fechamento | Mostre rapidamente o QR BIP-21 e diga: “There is also a QR rail for other BCH wallets. BlazeTip: direct BCH tips, a live supporter wall and streamer alerts.” |

## Plano alternativo sem pairing validado

Não encene uma gorjeta como se fosse on-chain. Mostre o QR BIP-21 sem escanear,
apresente o mural como interface dependente de atividade do endereço e use
**Test Alert** somente com o selo de demonstração visível. Diga que pairing,
pagamento e detecção em Chipnet ainda precisam ser demonstrados ao vivo.

Notas: nunca mostrar seed, chave privada ou dados pessoais. Não usar Mainnet nem
aprovar transação Mainnet para a demo. Renderizar em 1080p30; manter prompts e
TXID legíveis quando aparecerem.
