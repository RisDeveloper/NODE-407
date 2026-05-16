<?php
require_once 'php/config.php';
checkMaintenance();
requireLogin();
readfile('chat.html');
