import { TranslationContext } from "../contexts/TranslationContext";
import LanguageSelector from "./LanguageSelector";
import React, { useContext, useState } from "react";
import { AuthContext } from "../contexts/AuthContext";
import "./header.css";
import Avatar from "@mui/material/Avatar";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Settings from "@mui/icons-material/Settings";
import Logout from "@mui/icons-material/Logout";
import logo from "../assets/logo.jpg";
import Badge from "@mui/material/Badge";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { NotificationContext } from "../contexts/NotificationContext";

export default function Header() {
  const { user, logout } = useContext(AuthContext);
  const { lang, setLang, t } = useContext(TranslationContext);
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const [notifAnchor, setNotifAnchor] = useState(null);
  const { notifications, unreadCount, markAsRead, clearAll } =
    useContext(NotificationContext);

  const openNotif = Boolean(notifAnchor);
  const handleOpenNotif = (e) => setNotifAnchor(e.currentTarget);
  const handleCloseNotif = () => setNotifAnchor(null);

  return (
    <header className="app-header">
      <div className="left">
        {" "}
        <div className="logo">
          <img src={logo} alt="Logo" height={60} width={60} />
        </div>{" "}
      </div>
      <div className="center">
        <h1 className="site-title">{t("main.title")}</h1>
      </div>
      <div className="right">
        {/* Language selector - simple */}
        <LanguageSelector
          className="lang-select"
          lang={lang}
          setLang={setLang}
        />

        <Tooltip title="Notifications">
          <IconButton onClick={handleOpenNotif} sx={{ ml: 1 }} color="inherit">
            <Badge badgeContent={unreadCount} color="success">
              <NotificationsIcon />
            </Badge>
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={notifAnchor}
          id="notif-menu"
          open={openNotif}
          onClose={handleCloseNotif}
          PaperProps={{ elevation: 4 }}
          transformOrigin={{ horizontal: "right", vertical: "top" }}
          anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        >
          <MenuItem disabled>Notifications ({unreadCount} unread)</MenuItem>
          <Divider />
          {notifications.length === 0 && (
            <MenuItem disabled>No notifications</MenuItem>
          )}
          {notifications.map((n) => (
            <MenuItem
              key={n.id}
              onClick={async () => {
                await markAsRead(n.id);
                handleCloseNotif();
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontWeight: n.is_read ? 400 : 700 }}>
                  {n.payload?.title || JSON.stringify(n.payload).slice(0, 60)}
                </div>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
            </MenuItem>
          ))}
          {notifications.length > 0 && (
            <>
              <Divider />
              <MenuItem
                onClick={() => {
                  clearAll();
                  handleCloseNotif();
                }}
              >
                Clear all
              </MenuItem>
            </>
          )}
        </Menu>

        <Tooltip title="Account settings">
          <IconButton
            onClick={handleOpen}
            size="small"
            sx={{ ml: 2 }}
            aria-controls={open ? "account-menu" : undefined}
            aria-haspopup="true"
            aria-expanded={open ? "true" : undefined}
          >
            <Avatar
              src={user?.photo || undefined}
              sx={{ width: 40, height: 40 }}
            >
              {!user?.photo && (user?.fullName ? user.fullName[0] : "U")}
            </Avatar>
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={anchorEl}
          id="account-menu"
          open={open}
          onClose={handleClose}
          onClick={handleClose}
          PaperProps={{ elevation: 4 }}
          transformOrigin={{ horizontal: "right", vertical: "top" }}
          anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        >
          <MenuItem>
            <ListItemIcon>
              <Settings fontSize="small" />
            </ListItemIcon>
            Settings
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              logout();
              handleClose();
            }}
          >
            <ListItemIcon>
              <Logout fontSize="small" />
            </ListItemIcon>
            Logout
          </MenuItem>
        </Menu>
      </div>
    </header>
  );
}
