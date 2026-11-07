#!/usr/bin/env bash
# Préparation d'un serveur Ubuntu 24.04 neuf, à lancer UNE fois en root :
#   bash server-setup.sh deploy
# Prérequis : votre clé SSH est déjà dans /root/.ssh/authorized_keys (sinon vous seriez bloqué dehors).
set -euo pipefail
DEPLOY_USER="${1:-deploy}"

if [ ! -s /root/.ssh/authorized_keys ]; then
  echo "Aucune clé SSH dans /root/.ssh/authorized_keys : ajoutez-en une avant de lancer ce script." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get -y upgrade
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades rclone age

# ---- Docker (dépôt officiel) ----
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# ---- Utilisateur de déploiement (clé SSH de root recopiée) ----
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG docker,sudo "$DEPLOY_USER"
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"

# ---- SSH : clés uniquement, pas de connexion root ----
cat > /etc/ssh/sshd_config.d/10-annonces.conf <<CONF
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
sshd -t
# Ubuntu 24.04 lance SSH à la demande (ssh.socket) : chaque connexion relit la configuration, il n'y a alors rien à recharger.
systemctl reload ssh 2>/dev/null || true

# ---- Pare-feu : seul SSH entre. Le site et l'API arrivent par le tunnel Cloudflare (sortant). ----
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

# ---- Mises à jour de sécurité automatiques ----
dpkg-reconfigure -f noninteractive unattended-upgrades

# ---- Mémoire d'échange (la construction du site Next.js est gourmande) ----
if ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---- Tampons UDP pour cloudflared (QUIC) ----
printf 'net.core.rmem_max=7500000
net.core.wmem_max=7500000
' > /etc/sysctl.d/90-cloudflared.conf
sysctl -q --system

# ---- Dossiers ----
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" /opt/annonces
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /var/backups/annonces
timedatectl set-timezone UTC

echo
echo "Serveur prêt. Reconnectez-vous avec : ssh $DEPLOY_USER@<ip-du-serveur>"
echo "Testez cette connexion AVANT de fermer la session root actuelle."
