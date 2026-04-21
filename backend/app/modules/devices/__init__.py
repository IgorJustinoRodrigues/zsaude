"""Módulo de dispositivos pareados.

Totens (autoatendimento) e painéis de chamadas (TV) são **dispositivos**
que rodam em navegadores públicos — sem login de usuário. Pra obter
acesso autenticado aos endpoints do sistema, eles passam por um
pareamento:

1. Device abre URL pública (ex.: ``/dispositivo/totem``).
2. Chama ``POST /public/devices/register`` e recebe ``(deviceId,
   pairingCode)``. O **code** vai na tela; o **deviceId** fica só no
   device.
3. Usuário autenticado no app vê o code, informa ``(code, facilityId,
   name, type)`` em ``POST /devices/pair``.
4. Device — que está fazendo polling de ``GET /public/devices/status?
   deviceId=X`` — recebe o ``deviceToken`` de volta e guarda em
   ``localStorage``.

A partir daí o device usa o ``deviceToken`` (header ``X-Device-Token``)
pra chamar endpoints próprios e/ou abrir WebSocket.
"""
