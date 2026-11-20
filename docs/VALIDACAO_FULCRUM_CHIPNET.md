# Validação ao vivo do cliente Fulcrum em Chipnet (16/11/2026)

Validação de campo **somente leitura** da camada de dados do BlazeTip contra o
servidor Fulcrum público de Chipnet (`wss://chipnet.imaginary.cash:50004`,
Fulcrum 2.1.4, protocolo 1.4). Nenhuma transação, broadcast, chave privada ou
carteira foi usada — apenas dados públicos da rede (blocos e transações
mineradas recentes). Executada às 02:52–02:55 UTC de 16/11/2026.

## O que foi validado (7/7 testes, 2 execuções limpas)

1. **Conexão** ao servidor chipnet do app (o mesmo endpoint de `ENDPOINTS`
   em `src/services/fulcrum.ts`), medindo latência; `server.version` aceito.2. **`blockchain.headers.subscribe`** → tip real (altura ~333.496+) com header hex.
3. **Derivação de scripthash ida-e-volta com dado real da cadeia**: output
   P2PKH de transação minerada → `lockingBytecodeToCashAddress` (bchtest) →
   `addressToScripthash` do app → scripthash idêntico ao calculado direto do
   bytecode (SHA-256 invertido).
4. **`getAddressBalance`** do app → `confirmed`/`unconfirmed` coerentes (≥ 0).
5. **`getRecentTransactions`** do app: `get_history` + `transaction.get` +
   `extractPaymentInfoFromTxHex` parseando hex real sem erro; `amountSats`
   coerente quando presente.
6. **`listUnspent`** do app → UTXOs com `value > 0` e tx_hash válido.
7. **Ciclo `subscribe`/`unsubscribe`** por endereço no servidor real, com o
   mesmo registro/desregistro de callback usado pelo SupporterWall e overlay.

## Como reproduzir

```bash
npx vitest run --config scripts/vitest.live.config.ts
# arquivo: scripts/fulcrum_chipnet.live.ts (fora da suíte padrão `pnpm test`,
# porque depende da rede pública — a suíte padrão segue 122/122 offline)
```

## Ajustes descobertos durante a validação (documentação)

- Este servidor Fulcrum expõe `blockchain.transaction.id_from_pos` (com
  underscore) e rejeita `blockchain.transaction.id.from_pos` ("Unsupported
  request"). O BlazeTip não usa esse método; registrada apenas como nota de
  compatibilidade de exploradores/consultas manuais.
- `blockchain.headers.subscribe` não aceita parâmetros e retorna objeto
  `{height, hex}`. Também não usado pelo app.
- A saída 0 de algumas coinbases é script `aa20…` (não endereçável como
  cashaddr padrão); a validação seleciona outputs P2PKH/P2SH padrão.
- Mineradores acham blocos durante a validação: alturas/posições recentes
  podem variar ("No transaction at position N"); a varredura tenta
  posições/alturas alternativas.

## Limites desta validação (honesto)

O fluxo de pagamento completo continua **não** validado em campo: pairing da
carteira (WizardConnect), prompt de rede/destinatário/valor/fee, assinatura,
broadcast, recibo de TXID e o evento no SupporterWall/overlay OBS exigem uma
carteira Chipnet com fundos controlada pelo Davi.
Nenhuma transação foi feita nesta sessão.
