# Instalação

A instalação do `azk` é realmente muito simples e está disponível através de pacotes no [Linux](linux.md) e no [Mac OS X](mac_os_x.md).

A instalação vai adicionar o comando `azk` ao path do sistema. Isso torna o comando `azk` disponível no terminal.

- [Mac OS X](mac_os_x.md)
- [Linux](linux.md)
  - [Ubuntu Trusty](linux.html#ubuntu-trusty-1404-lts-64-bit)
  - [Ubuntu Precise](linux.html#ubuntu-precise-1204-lts-64-bit)
  - [Fedora](linux.html#fedora-20)
- [Código fonte](source-code.md)
- [Atualizando](upgrading.md)

## Instalação expressa do azk

A forma mais fácil de instalar o `azk` é utilizar o script abaixo. Ele vai identificar o sistema operacional que está usando e, se for compatível, realizar todos os processos de instalação.

#### via curl

```sh
curl -Ls http://azk.io/install.sh | bash
```

#### via wget

```sh
wget -qO- http://azk.io/install.sh | bash
```

## Requisitos mínimos de instalação

* Uma máquina com arquitetura 64 bits
* Mac OS X ou Linux (Windows: planned)
* bash (ferramenta de linha de comando disponível em praticamente todos os sistemas unix)
* Conexão com a internet (apenas durante o processo de download das [imagens](../imagens/README.md))

!INCLUDE "../getting-started/banner.md"
