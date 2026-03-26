#!bin/bash
CYAN='\033[0;36m'
RED='\033[0;31m'
while : 
do
printf "${CYAN}︎Sistema de reinício automático, iniciando...\n"
node te_amo_sixx.js
sleep 12000
printf "${RED}︎Programa fechado! Iniciando base novamente...\n"
done