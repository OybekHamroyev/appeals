import { TranslationContext } from "../contexts/TranslationContext";
import LanguageSelector from "./LanguageSelector";
import React, { useContext, useState } from "react";
import { AuthContext } from "../contexts/AuthContext";
import "./header.css";
import Avatar from "@mui/material/Avatar";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import IconButton from "@mui/material/IconButton";
import Logout from "@mui/icons-material/Logout";
import logo from "../assets/logo.jpg";
import Box from "@mui/material/Box";
export default function Header() {
  const { user, logout } = useContext(AuthContext);
  const { lang, setLang, t } = useContext(TranslationContext);
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

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

        {/* Notification UI removed from header: unread count shown on avatar badge instead */}
        <Box>
          <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={handleClose}
            PaperProps={{
              elevation: 0,
              sx: {
                overflow: "visible",
                filter: "drop-shadow(0px 2px 10px rgba(0,0,0,0.2))",
                mt: 1.5,
                "& .MuiAvatar-root": {
                  width: 32,
                  height: 32,
                  ml: -0.5,
                  mr: 1,
                },
                "&:before": {
                  content: '""',
                  display: "block",
                  position: "absolute",
                  top: 0,
                  right: 14,
                  width: 10,
                  height: 10,
                  bgcolor: "background.paper",
                  transform: "translateY(-50%) rotate(45deg)",
                  zIndex: 0,
                },
              },
            }}
          >
            <MenuItem onClick={logout}>
              <ListItemIcon>
                <Logout fontSize="small" />
              </ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
          <IconButton
            onClick={handleOpen}
            size="small"
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
        </Box>
      </div>
    </header>
  );
}
